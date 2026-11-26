import { NextResponse } from 'next/server';
import { badRequest, dbError, requireReorderActor } from '@/lib/reorder/access';
import { isStore } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// 후보 버리기 · 되돌리기 — 버린 상품명은 후보 목록에 다시 나오지 않는다.
async function read(req: Request) {
  const a = await requireReorderActor();
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof b?.name === 'string' ? b.name.trim() : '';
  if (!b || !isStore(b.store) || !name) return badRequest('요청이 올바르지 않습니다.');
  return { a, store: b.store, name };
}

export async function POST(req: Request) {
  const r = await read(req);
  if (r instanceof NextResponse) return r;
  const { error } = await r.a.svc.from('reorder_ignored').upsert({ store: r.store, name: r.name, created_by_name: r.a.name }, { onConflict: 'store,name' });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await read(req);
  if (r instanceof NextResponse) return r;
  const { error } = await r.a.svc.from('reorder_ignored').delete().eq('store', r.store).eq('name', r.name);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
