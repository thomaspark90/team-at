import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { weekDays, weekStartOf } from '@/lib/schedule/time';
import { isYmd } from '@/lib/teaching/kst';
import { TEMPLATE_NAME_MAX } from '@/lib/schedule/types';

export const runtime = 'nodejs';

// 주 템플릿(운영진 전용) — 한 주의 계획을 이름 붙여 저장해 두고 다른 주에 불러온다. 지점별.
// GET ?store / POST { store, weekStart, name } (이번 주 계획을 저장) / DELETE { id }
// 저장 형식 [{ dow(0=화…6=월), s: staffId, a: 시작분, b: 종료분 }]. 퇴사자·쉼은 저장하지 않는다.
export async function GET(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const store = new URL(req.url).searchParams.get('store');
  if (!isStore(store)) return badRequest('지점을 선택하세요.');
  const { data, error } = await a.svc.from('schedule_week_templates').select('id, name, shifts, created_at').eq('store', store).order('name');
  if (error) return dbError(error);
  return NextResponse.json({
    templates: (data ?? []).map((t) => ({ id: Number(t.id), name: t.name, count: Array.isArray(t.shifts) ? t.shifts.length : 0, createdAt: t.created_at })),
  });
}

export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  if (!isYmd(b?.weekStart)) return badRequest('주가 올바르지 않습니다.');
  const name = String(b?.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > TEMPLATE_NAME_MAX) return badRequest(`템플릿 이름은 1~${TEMPLATE_NAME_MAX}자입니다.`);
  const days = weekDays(weekStartOf(b.weekStart));
  const { data: plan, error: pErr } = await a.svc
    .from('schedule_shifts')
    .select('work_date, staff_id, start_min, end_min, schedule_staff!inner(active)')
    .eq('store', b.store)
    .eq('kind', 'plan')
    .eq('is_off', false)
    .not('start_min', 'is', null)
    .gte('work_date', days[0])
    .lte('work_date', days[6]);
  if (pErr) return dbError(pErr);
  const rows = (plan ?? [])
    .filter((r) => (r.schedule_staff as unknown as { active: boolean }).active)
    .map((r) => ({ dow: days.indexOf(r.work_date as string), s: Number(r.staff_id), a: r.start_min, b: r.end_min }));
  if (!rows.length) return badRequest('이 주에 저장할 계획이 없습니다.');
  const { data, error } = await a.svc.from('schedule_week_templates').insert({ store: b.store, name, shifts: rows, created_by: a.email }).select('id').single();
  if (error?.code === '23505') return NextResponse.json({ error: '같은 이름의 템플릿이 있습니다.' }, { status: 409 });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, id: Number(data.id), count: rows.length });
}

export async function DELETE(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return badRequest('템플릿을 선택하세요.');
  const { error } = await a.svc.from('schedule_week_templates').delete().eq('id', id);
  return error ? dbError(error) : NextResponse.json({ ok: true });
}
