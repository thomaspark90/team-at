import { NextResponse } from 'next/server';
import { badRequest, dbError, forbid, requireChecklistActor } from '@/lib/checklist/access';
import { renumber } from '@/lib/checklist/ordering';
import { loadItems } from '@/lib/checklist/queries';
import { isStore } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// POST { store, shiftType, order: [{ id, section }] } — 한 조의 항목 순서·구역을 한 번에 저장(항목 관리 권한).
// 목록 전체를 받아, 다른 사람이 동시에 항목을 더하거나 지웠으면 어긋남을 알리고 덮어쓰지 않는다.
export async function POST(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  if (!a.canManageItems) return forbid();
  const b = await req.json().catch(() => null);
  if (!b || !isStore(b.store) || (b.shiftType !== 'open' && b.shiftType !== 'close') || !Array.isArray(b.order)) return badRequest('요청이 올바르지 않습니다.');
  const order: { id: number; section: string }[] = b.order.map((o: { id: unknown; section: unknown }) => ({
    id: Number(o?.id),
    section: typeof o?.section === 'string' ? o.section.trim().slice(0, 120) : '',
  }));
  if (order.some((o) => !Number.isInteger(o.id) || !o.section)) return badRequest('구역 이름을 적어주세요.');

  try {
    const current = (await loadItems(a.svc, b.store)).filter((i) => i.shiftType === b.shiftType);
    const known = new Map(current.map((i) => [i.id, i]));
    if (new Set(order.map((o) => o.id)).size !== order.length || order.length !== current.length || order.some((o) => !known.has(o.id))) {
      return NextResponse.json({ error: '다른 사람이 항목을 바꿨습니다. 새로고침한 뒤 다시 해 주세요.' }, { status: 409 });
    }
    const changed = renumber(order).filter((o) => {
      const cur = known.get(o.id)!;
      return cur.sortOrder !== o.sortOrder || cur.section !== o.section;
    });
    const now = new Date().toISOString();
    const results = await Promise.all(
      changed.map((o) => a.svc.from('checklist_items').update({ sort_order: o.sortOrder, section: o.section, updated_at: now }).eq('id', o.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return dbError(failed.error);
    return NextResponse.json({ items: await loadItems(a.svc, b.store) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
