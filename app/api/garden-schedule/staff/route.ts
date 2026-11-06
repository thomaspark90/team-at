import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { toStaff } from '@/lib/schedule/queries';

export const runtime = 'nodejs';

// 근무자 명부 — POST { name, homeStore } / PATCH { id, name?, homeStore?, active? }. 기록 보존을 위해 삭제는 없다(재직 끄기).
export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const name = String(b?.name ?? '').trim();
  if (!name) return badRequest('이름을 입력하세요.');
  if (!isStore(b?.homeStore)) return badRequest('지점을 선택하세요.');
  const { data, error } = await a.svc.from('schedule_staff').insert({ name, home_store: b.homeStore }).select().single();
  if (error?.code === '23505') return NextResponse.json({ error: '이미 있는 이름입니다.' }, { status: 409 });
  if (error) return dbError(error);
  return NextResponse.json({ staff: toStaff(data) });
}

export async function PATCH(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return badRequest('근무자를 선택하세요.');
  const patch: Record<string, unknown> = {};
  if (typeof b?.active === 'boolean') patch.active = b.active;
  if (b?.homeStore !== undefined) {
    if (!isStore(b.homeStore)) return badRequest('지점이 올바르지 않습니다.');
    patch.home_store = b.homeStore;
  }
  if (b?.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return badRequest('이름을 입력하세요.');
    patch.name = name;
  }
  const { error } = await a.svc.from('schedule_staff').update(patch).eq('id', id);
  if (error?.code === '23505') return NextResponse.json({ error: '이미 있는 이름입니다.' }, { status: 409 });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
