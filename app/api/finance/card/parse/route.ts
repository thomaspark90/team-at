import { NextResponse } from 'next/server';
import { parseCardXlsx } from '@/lib/finance/card';
import { dedupe } from '@/lib/finance/parse';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { CARD_COMPANIES } from '@/lib/finance/cardOffset';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 카드 이용내역 엑셀 미리보기 + 은행 '신한카드' 결제 건 자동매칭 후보
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
  if (!(file instanceof File)) return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });

  let result;
  try {
    result = parseCardXlsx(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: `엑셀을 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (result.totalRows === 0) {
    return NextResponse.json(
      { error: '이용내역을 읽지 못했습니다. 현재는 신한카드 이용내역 엑셀만 지원해요 — 비씨·현대카드 명세는 파일 포맷 확인 후 파서를 추가할 예정이에요.' },
      { status: 422 }
    );
  }

  // DB 지문 대조 → 신규만
  const hashes = result.transactions.map((t) => t.dedupHash);
  const existing = await fetchExistingHashes(supabase, hashes);
  const { fresh, duplicates } = dedupe(result.transactions, existing);

  const net = result.sumOut - result.sumIn; // 청구 예상액(환불 차감)
  const yms = Array.from(new Set(result.transactions.map((t) => t.ym))).sort();
  const usageYm = yms[yms.length - 1] ?? null;

  // 매칭 후보: 은행 카드대금 결제 출금 (source=bank) — 같은 브랜드 통장의 결제 건만.
  // 카드사 목록은 cardOffset.CARD_COMPANIES 단일 정의에서 파생 — 배열 사본이 따로 놀면
  // 대사 후보와 손익 상쇄의 판정이 어긋난다(2026-08-21 감사 C1, 사본 3벌 → 1벌).
  // ilike(대소문자 무시)는 후보 '검색'이라 과잉 매칭이 안전한 쪽 — 판정 정본은 CARD_PAYMENT_RE.
  const brand = String(form.get('brand') ?? 'garden');
  const CARD_MEMO_OR = CARD_COMPANIES.map((k) => `memo.ilike.%${k}%`).join(',');
  const { data: cand } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,tx_at,memo,amount_out,ym,category_id')
    .eq('source', 'bank')
    .eq('brand', brand === 'staffmeal' ? 'staffmeal' : 'garden')
    .gt('amount_out', 0)
    .or(CARD_MEMO_OR)
    .order('tx_at', { ascending: false })
    .limit(24);
  const candidates = (cand ?? [])
    .map((c: { id: number; tx_at: string; memo: string; amount_out: number; ym: string }) => ({
      id: c.id,
      txAt: c.tx_at,
      memo: c.memo,
      amount: c.amount_out,
      ym: c.ym,
      diff: c.amount_out - net,
    }))
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))
    .slice(0, 6);

  return NextResponse.json({
    totalRows: result.totalRows,
    fresh: fresh.length,
    duplicates,
    sumOut: result.sumOut,
    sumIn: result.sumIn,
    net,
    usageYm,
    sample: fresh.slice(0, 300),
    candidates,
  });
}
