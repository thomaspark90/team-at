import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { dedupe } from '@/lib/finance/parse';
import { checkBalanceContinuity, fileToRows, inferMapping, rowsToTransactions } from '@/lib/finance/excel';
import { monthCoverage } from '@/lib/finance/coverage';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 미리보기: 엑셀 → AI 열 매핑 → 변환 → DB 지문 대조. 매핑을 응답에 실어
// 저장 요청 때 되돌려받는다(저장 시 AI 재호출·판정 흔들림 방지).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '회계 입력 권한이 없습니다.' }, { status: 403 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 없어요.' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const ym = typeof form.get('ym') === 'string' ? String(form.get('ym')) : null; // 보드에서 선택한 월
  const slot = typeof form.get('slot') === 'string' ? String(form.get('slot')) : null; // 잔액 연속성은 은행 슬롯만
  const brand = typeof form.get('brand') === 'string' ? String(form.get('brand')) : null; // 교차 형식 경고용
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });
  }

  try {
    const rows = fileToRows(new Uint8Array(await file.arrayBuffer()));
    if (rows.length < 2) {
      return NextResponse.json({ error: '시트에서 데이터를 찾지 못했어요.' }, { status: 422 });
    }
    const mapping = await inferMapping(rows, key);
    const result = rowsToTransactions(rows, mapping);
    if (result.totalRows === 0) {
      return NextResponse.json({ error: '거래를 읽지 못했어요. 거래내역 형태의 엑셀인지 확인해주세요.' }, { status: 422 });
    }

    const existing = await fetchExistingHashes(
      supabase,
      result.transactions.map((t) => t.dedupHash)
    );
    const { fresh, duplicates } = dedupe(result.transactions, existing);

    // 이 파일이 선택한 월을 얼마나 덮는지 — 부분 업로드(예: 5~15일치만) 경고용.
    // 중복 포함 전체 행 기준(재업로드로 채우는 경우도 커버리지는 인정).
    let coverage = null;
    if (ym) {
      const inMonth = result.transactions.filter((t) => t.ym === ym).map((t) => t.txAt.slice(0, 10)).sort();
      coverage = inMonth.length
        ? monthCoverage(ym, [{ start: inMonth[0], end: inMonth[inMonth.length - 1] }])
        : { full: false, label: null, pct: 0 };
    }

    // 은행 슬롯 + 잔액 열이 있을 때만 — 중간 행 누락(잔액 흐름 끊김) 검사
    const continuity =
      slot?.startsWith('bank_') && mapping.balance != null
        ? checkBalanceContinuity(result.transactions)
        : null;

    // 잔액 흐름의 양 끝 — 여러 파일 업로드 시 파일 사이 연속성 검사용(클라이언트에서 대조)
    const balRows = [...result.transactions].sort((a, b) => (a.txAt < b.txAt ? -1 : 1)).filter((t) => t.balance !== 0);
    const boundary = balRows.length
      ? {
          first: {
            txAt: balRows[0].txAt,
            amountIn: balRows[0].amountIn,
            amountOut: balRows[0].amountOut,
            balance: balRows[0].balance,
          },
          last: { txAt: balRows[balRows.length - 1].txAt, balance: balRows[balRows.length - 1].balance },
        }
      : null;

    // 교차 형식 경고 — 같은 브랜드·겹치는 기간에 PDF 업로드 이력이 있으면
    // 지문 체계가 달라 중복이 안 걸러진다(이중 저장 위험) → 저장 전 경고용
    let crossFormat: { count: number } | null = null;
    if (brand && slot?.startsWith('bank_')) {
      const dates = result.transactions.map((t) => t.txAt).sort();
      const ps = dates[0]?.slice(0, 10);
      const pe = dates[dates.length - 1]?.slice(0, 10);
      if (ps && pe) {
        // PDF 업로드 = slot 없는 은행 업로드 (엑셀 은행 슬롯 업로드도 bank=은행명을 가지므로 slot으로 구분)
        const { count } = await supabase
          .schema('finance')
          .from('uploads')
          .select('id', { count: 'exact', head: true })
          .eq('brand', brand)
          .eq('source', 'bank')
          .is('slot', null)
          .in('bank', ['shinhan', 'woori'])
          .lte('period_start', pe)
          .gte('period_end', ps);
        if ((count ?? 0) > 0) crossFormat = { count: count ?? 0 };
      }
    }

    return NextResponse.json({
      coverage,
      continuity,
      boundary,
      crossFormat,
      mapping,
      totalRows: result.totalRows,
      skipped: result.skipped,
      sumIn: result.sumIn,
      sumOut: result.sumOut,
      fresh: fresh.length,
      duplicates,
      // 선택한 월 밖의 거래 수 — 다른 달 파일을 잘못 올린 경우 경고용
      outOfMonth: ym ? fresh.filter((t) => t.ym !== ym).length : 0,
      sample: fresh.slice(0, 200),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
