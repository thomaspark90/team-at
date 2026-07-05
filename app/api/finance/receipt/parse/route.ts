import { NextResponse } from 'next/server';
import { parseReceiptPdf, groupByApproval } from '@/lib/finance/receipt';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 쿠팡 매출전표 미리보기 + 카드 '쿠팡' 거래 매칭(승인번호 우선, 없으면 날짜+금액)
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
  if (!(file instanceof File)) return NextResponse.json({ error: 'PDF 전표를 선택하세요.' }, { status: 400 });

  let items;
  try {
    items = await parseReceiptPdf(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: `전표를 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: '전표 품목을 읽지 못했습니다. 쿠팡 신용카드 매출전표 PDF인지 확인하세요.' }, { status: 422 });
  }

  const { data: splitCat } = await supabase
    .schema('finance')
    .from('categories')
    .select('id')
    .eq('type', 'excluded')
    .eq('name', '영수증분해')
    .maybeSingle();
  const splitId = splitCat?.id ?? -1;

  const { data: cardRows } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,tx_at,amount_out,memo,category_id,approval_no')
    .eq('source', 'card')
    .gt('amount_out', 0)
    .ilike('memo', '%쿠팡%')
    .limit(3000);
  // 이미 분해된 원본(영수증분해) / 품목 행('쿠팡 · ')은 매칭 대상에서 제외
  const usable = (cardRows ?? []).filter(
    (r: { memo: string; category_id: number | null }) => r.category_id !== splitId && !String(r.memo).startsWith('쿠팡 · ')
  );

  const match = (appr: string, sum: number, ymd: string) => {
    let m = usable.find((r: { approval_no: string | null }) => r.approval_no && r.approval_no === appr);
    if (!m) m = usable.find((r: { tx_at: string; amount_out: number }) => r.tx_at.slice(0, 10) === ymd && r.amount_out === sum);
    return m ?? null;
  };

  const groups = groupByApproval(items);
  const preview: unknown[] = [];
  let matched = 0;
  for (const [approvalNo, its] of Array.from(groups)) {
    const sum = its.reduce((s, i) => s + i.amount, 0);
    const ymd = its[0].ymd;
    const m = match(approvalNo, sum, ymd) as { id: number; memo: string; amount_out: number; tx_at: string } | null;
    if (m) matched++;
    preview.push({
      approvalNo,
      ymd,
      sum,
      itemCount: its.length,
      items: its.map((i) => ({ product: i.product, seller: i.seller, amount: i.amount })),
      matched: m ? { id: m.id, memo: m.memo, amount: m.amount_out, txAt: m.tx_at } : null,
    });
  }

  return NextResponse.json({ totalItems: items.length, groups: preview.length, matched, preview });
}
