import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { parseReceiptPdf, groupByApproval } from '@/lib/finance/receipt';
import { normalizeKey } from '@/lib/finance/normalize';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';
export const maxDuration = 30;

const hash = (...parts: (string | number)[]): string =>
  createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);

// 매칭된 쿠팡 카드 건을 '영수증분해(제외)'로 잠그고, 품목 행들을 거래에 삽입.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '저장 권한이 없습니다.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'PDF 전표를 선택하세요.' }, { status: 400 });

  let items;
  try {
    items = await parseReceiptPdf(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: `전표를 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (items.length === 0) return NextResponse.json({ error: '전표 품목을 읽지 못했습니다.' }, { status: 422 });

  const { data: splitCat } = await supabase
    .schema('finance')
    .from('categories')
    .select('id')
    .eq('type', 'excluded')
    .eq('name', '영수증분해')
    .maybeSingle();
  if (!splitCat) {
    return NextResponse.json({ error: "'영수증분해' 계정과목이 없습니다. migration_receipt.sql 을 먼저 실행하세요." }, { status: 400 });
  }
  const splitId = splitCat.id as number;

  const { data: cardRows } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,tx_at,ym,amount_out,memo,category_id,approval_no,card_issuer')
    .eq('source', 'card')
    .gt('amount_out', 0)
    .ilike('memo', '%쿠팡%')
    .limit(3000);
  type CardRow = { id: number; tx_at: string; ym: string; amount_out: number; memo: string; category_id: number | null; approval_no: string | null; card_issuer: string | null };
  const usable = (cardRows ?? []).filter((r: CardRow) => r.category_id !== splitId && !r.memo.startsWith('쿠팡 · '));
  const match = (appr: string, sum: number, ymd: string): CardRow | null => {
    let m = usable.find((r: CardRow) => r.approval_no && r.approval_no === appr);
    if (!m) m = usable.find((r: CardRow) => r.tx_at.slice(0, 10) === ymd && r.amount_out === sum);
    return m ?? null;
  };

  const now = new Date().toISOString();
  const groups = groupByApproval(items);
  const rowsToInsert: Record<string, unknown>[] = [];
  const parentIds: number[] = [];
  let matchedGroups = 0;

  for (const [approvalNo, its] of Array.from(groups)) {
    const sum = its.reduce((s, i) => s + i.amount, 0);
    const parent = match(approvalNo, sum, its[0].ymd);
    if (!parent) continue;
    matchedGroups++;
    parentIds.push(parent.id);
    for (const it of its) {
      const keySrc = it.seller && !/쿠팡\(주\)/.test(it.seller) ? it.seller : it.product;
      rowsToInsert.push({
        bank: 'shinhan',
        source: 'card',
        card_issuer: parent.card_issuer ?? '신한',
        is_installment: it.installment,
        tx_at: it.txAt,
        ym: it.txAt.slice(0, 7),
        channel: '쿠팡영수증',
        memo: `쿠팡 · ${it.product}${it.seller ? ` (${it.seller})` : ''}`.slice(0, 300),
        amount_out: it.amount,
        amount_in: 0,
        balance: 0,
        branch: null,
        dedup_hash: hash('receipt', approvalNo, it.seller, it.amount, it.product),
        normalized_key: normalizeKey(keySrc),
        approval_no: approvalNo,
        category_id: null,
        classified_by: null,
        classified_at: null,
      });
    }
  }

  if (matchedGroups === 0) {
    return NextResponse.json({ matchedGroups: 0, inserted: 0, note: '매칭되는 카드 쿠팡 거래가 없습니다.' });
  }

  // 품목 dedup(재적용 대비)
  const hashes = rowsToInsert.map((r) => r.dedup_hash as string);
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 100) {
    const { data } = await supabase.schema('finance').from('transactions').select('dedup_hash').in('dedup_hash', hashes.slice(i, i + 100));
    (data ?? []).forEach((e: { dedup_hash: string }) => existing.add(e.dedup_hash));
  }
  const freshRows = rowsToInsert.filter((r) => !existing.has(r.dedup_hash as string));

  // 원본 쿠팡 카드 건 → 영수증분해(손익 제외)로 잠금
  const { error: lockErr } = await supabase
    .schema('finance')
    .from('transactions')
    .update({ category_id: splitId, classified_by: user.id, classified_at: now })
    .in('id', parentIds);
  if (lockErr) return NextResponse.json({ error: `원본 잠금 실패: ${lockErr.message}` }, { status: 500 });

  if (freshRows.length > 0) {
    const { error: insErr } = await supabase.schema('finance').from('transactions').insert(freshRows);
    if (insErr) return NextResponse.json({ error: `품목 저장 실패: ${insErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ matchedGroups, inserted: freshRows.length, duplicates: rowsToInsert.length - freshRows.length });
}
