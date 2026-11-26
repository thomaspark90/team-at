import { NextResponse } from 'next/server';
import { badRequest, requireReorderActor } from '@/lib/reorder/access';
import { loadBoard } from '@/lib/reorder/queries';
import { isStore } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// 발주 품목표 — 품목(지난 구매가·판매처 포함)과 결제 기록에서 뽑은 후보.
export async function GET(req: Request) {
  const a = await requireReorderActor();
  if (a instanceof NextResponse) return a;
  const store = new URL(req.url).searchParams.get('store');
  if (!isStore(store)) return badRequest('지점을 선택하세요.');
  try {
    return NextResponse.json(await loadBoard(a.svc, store));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
