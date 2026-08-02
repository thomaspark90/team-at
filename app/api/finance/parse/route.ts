import { NextResponse } from 'next/server';
import { pdfToLayoutText } from '@/lib/finance/pdf';
import { parseStatement, dedupe } from '@/lib/finance/parse';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import type { BankSource } from '@/lib/finance/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 미리보기: 파싱 + DB 기존 지문 대조로 실제 신규/중복 산출
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '재무 입력 권한이 없습니다.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const bank = form.get('bank') as BankSource | null;
  const password = (form.get('password') as string) || undefined;
  if (!(file instanceof File) || (bank !== 'shinhan' && bank !== 'woori')) {
    return NextResponse.json({ error: '파일과 은행을 선택하세요.' }, { status: 400 });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = await pdfToLayoutText(data, password);
  } catch (e) {
    const msg = (e as Error).message || '';
    return NextResponse.json(
      { error: /password/i.test(msg) ? 'PDF 비밀번호가 필요하거나 틀렸습니다.' : `PDF를 열지 못했습니다: ${msg}` },
      { status: 400 }
    );
  }

  const result = parseStatement(bank, text);
  if (result.totalRows === 0) {
    return NextResponse.json({ error: '거래를 읽지 못했습니다. 은행 선택을 확인하세요.' }, { status: 422 });
  }

  const existing = await fetchExistingHashes(
    supabase,
    result.transactions.map((t) => t.dedupHash)
  );
  const { fresh, duplicates } = dedupe(result.transactions, existing);

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

  // 교차 형식 경고 — 같은 브랜드·겹치는 기간에 엑셀 업로드 이력이 있으면
  // 지문 체계가 달라 중복이 안 걸러진다(이중 저장 위험) → 저장 전 경고용
  const brand = typeof form.get('brand') === 'string' ? String(form.get('brand')) : null;
  let crossFormat: { count: number } | null = null;
  if (brand) {
    const dates = result.transactions.map((t) => t.txAt).sort();
    const ps = dates[0]?.slice(0, 10);
    const pe = dates[dates.length - 1]?.slice(0, 10);
    if (ps && pe) {
      // 엑셀 업로드 = 은행 슬롯(slot 있음) 업로드 또는 구버전 bank='excel' 기록
      const { count } = await supabase
        .schema('finance')
        .from('uploads')
        .select('id', { count: 'exact', head: true })
        .eq('brand', brand)
        .eq('source', 'bank')
        .or('bank.eq.excel,slot.not.is.null')
        .lte('period_start', pe)
        .gte('period_end', ps);
      if ((count ?? 0) > 0) crossFormat = { count: count ?? 0 };
    }
  }

  return NextResponse.json({
    bank: result.bank,
    totalRows: result.totalRows,
    sumIn: result.sumIn,
    sumOut: result.sumOut,
    fresh: fresh.length,
    duplicates,
    boundary,
    crossFormat,
    sample: fresh.slice(0, 200),
  });
}
