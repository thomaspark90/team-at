import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { toStaff } from '@/lib/schedule/queries';
import { isYmd, kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// 근무자 명부(운영진 전용) — GET / POST { name, homeStore } / PATCH { id, name?, homeStore?, joinedOn?, active? }.
// 기록 보존을 위해 삭제는 없다(재직 끄기).
export async function GET() {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const { data, error } = await a.svc.from('schedule_staff').select('id, name, home_store, joined_on, active').order('name');
  if (error) return dbError(error);
  // 마지막 근무일 — 사람당 한 건만 읽는다(staff_id, work_date 인덱스). 작성 중인 미래 계획은 세지 않는다.
  const today = kstToday();
  const last = await Promise.all(
    (data ?? []).map((s) =>
      a.svc
        .from('schedule_shifts')
        .select('work_date')
        .eq('staff_id', s.id)
        .eq('is_off', false)
        .lte('work_date', today)
        .order('work_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  return NextResponse.json({
    staff: (data ?? []).map((s, i) => ({ ...toStaff(s), lastWorked: (last[i].data?.work_date as string | undefined) ?? null })),
    today,
  });
}

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
  if (b?.joinedOn !== undefined) {
    if (b.joinedOn !== null && !isYmd(b.joinedOn)) return badRequest('입사일이 올바르지 않습니다.');
    patch.joined_on = b.joinedOn;
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
