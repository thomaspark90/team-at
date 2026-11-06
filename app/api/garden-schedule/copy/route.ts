import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { weekDays, weekStartOf } from '@/lib/schedule/time';
import { addDays, isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { store, weekStart, overwrite? } — 지난주를 이번 주 계획으로 복사.
// 지난주 계획이 없으면(시트 이관 직후) 지난주 실제 근무를 본으로 쓴다. 퇴사 처리된 사람은 뺀다.
// 이번 주에 이미 계획이 있으면 overwrite 없이는 409 — 작성한 내용을 말없이 지우지 않는다.
export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  if (!isYmd(b?.weekStart)) return badRequest('주가 올바르지 않습니다.');
  const store = b.store;
  const days = weekDays(weekStartOf(b.weekStart));
  const from = addDays(days[0], -7);
  const to = addDays(days[6], -7);

  const { count, error: cErr } = await a.svc
    .from('schedule_shifts')
    .select('id', { count: 'exact', head: true })
    .eq('store', store)
    .eq('kind', 'plan')
    .gte('work_date', days[0])
    .lte('work_date', days[6]);
  if (cErr) return dbError(cErr);
  if ((count ?? 0) > 0 && b?.overwrite !== true) {
    return NextResponse.json({ error: '이미 작성한 계획이 있습니다.', existing: count }, { status: 409 });
  }

  const { data: prev, error: pErr } = await a.svc
    .from('schedule_shifts')
    .select('work_date, staff_id, kind, start_min, end_min, is_off, schedule_staff!inner(active)')
    .eq('store', store)
    .eq('is_off', false)
    .gte('work_date', from)
    .lte('work_date', to);
  if (pErr) return dbError(pErr);
  const active = (prev ?? []).filter((r) => (r.schedule_staff as unknown as { active: boolean }).active);
  const plan = active.filter((r) => r.kind === 'plan');
  const source = plan.length ? plan : active.filter((r) => r.kind === 'actual');
  if (!source.length) return badRequest('지난주에 복사할 근무가 없습니다.');

  if ((count ?? 0) > 0) {
    const { error } = await a.svc.from('schedule_shifts').delete().eq('store', store).eq('kind', 'plan').gte('work_date', days[0]).lte('work_date', days[6]);
    if (error) return dbError(error);
  }
  const { error } = await a.svc.from('schedule_shifts').insert(
    source.map((r) => ({
      work_date: addDays(r.work_date as string, 7),
      store,
      staff_id: r.staff_id,
      kind: 'plan',
      start_min: r.start_min,
      end_min: r.end_min,
      updated_by: a.email,
    })),
  );
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, copied: source.length, from: plan.length ? 'plan' : 'actual' });
}
