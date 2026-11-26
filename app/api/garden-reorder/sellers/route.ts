import { NextResponse } from 'next/server';
import { badRequest, dbError, requireReorderActor } from '@/lib/reorder/access';

export const runtime = 'nodejs';

// 판매처 상태·배송비·링크 — 품목 × 판매처 한 줄. 행이 없으면 만든다(행 없음 = 확인 필요).
export async function PATCH(req: Request) {
  const a = await requireReorderActor();
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const seller = typeof b?.seller === 'string' ? b.seller.trim() : '';
  if (!b || !Number.isInteger(b.itemId) || !seller) return badRequest('요청이 올바르지 않습니다.');

  const cols: Record<string, unknown> = {};
  if ('status' in b) {
    if (!['trusted', 'pending', 'excluded'].includes(String(b.status))) return badRequest('상태가 올바르지 않습니다.');
    cols.status = b.status;
  }
  if ('shippingFee' in b) {
    if (b.shippingFee === null || b.shippingFee === '') cols.shipping_fee = null;
    else {
      const fee = Number(b.shippingFee);
      if (!Number.isInteger(fee) || fee < 0) return badRequest('배송비는 0 이상의 원 단위 숫자로 적어주세요.');
      cols.shipping_fee = fee;
    }
  }
  if ('url' in b) {
    const url = typeof b.url === 'string' ? b.url.trim() : '';
    if (url && !/^https?:\/\//i.test(url)) return badRequest('링크는 http 로 시작해야 합니다.');
    cols.url = url ? url.slice(0, 500) : null;
  }
  if (!Object.keys(cols).length) return badRequest('바꿀 내용이 없습니다.');

  const { error } = await a.svc
    .from('reorder_sellers')
    .upsert(
      { item_id: b.itemId, seller_name: seller.slice(0, 120), ...cols, updated_at: new Date().toISOString(), updated_by_name: a.name },
      { onConflict: 'item_id,seller_name' },
    );
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
