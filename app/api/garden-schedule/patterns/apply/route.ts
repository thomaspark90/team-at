import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { weekDays, weekStartOf } from '@/lib/schedule/time';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { store, weekStart } — 고정 패턴으로 그 주의 빈 칸(계획)을 채운다. 이미 계획이 있는 사람·날은 건드리지 않는다. 퇴사자·그 지점 근무자가 아닌 사람 제외.
export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  if (!isYmd(b?.weekStart)) return badRequest('주가 올바르지 않습니다.');
  const days = weekDays(weekStartOf(b.weekStart));
  const [pat, staff, existing] = await Promise.all([
    a.svc.from('schedule_staff_patterns').select('staff_id, dow, start_min, end_min').eq('store', b.store),
    a.svc.from('schedule_staff').select('id, stores, home_store').eq('active', true),
    a.svc.from('schedule_shifts').select('staff_id, work_date').eq('kind', 'plan').gte('work_date', days[0]).lte('work_date', days[6]),
  ]);
  const err = pat.error ?? staff.error ?? existing.error;
  if (err) return dbError(err);
  const here = new Set((staff.data ?? []).filter((s) => ((s.stores as string[] | null)?.length ? (s.stores as string[]) : [s.home_store]).includes(b.store)).map((s) => Number(s.id)));
  // 다른 지점 계획이 있는 날도 건너뛴다(두 지점 겹침 방지)
  const taken = new Set((existing.data ?? []).map((e) => `${e.staff_id}|${e.work_date}`));
  const rows = (pat.data ?? [])
    .filter((p) => here.has(Number(p.staff_id)) && !taken.has(`${p.staff_id}|${days[p.dow]}`))
    .map((p) => ({ work_date: days[p.dow], store: b.store, staff_id: Number(p.staff_id), kind: 'plan', start_min: p.start_min, end_min: p.end_min, updated_by: a.email }));
  const skipped = (pat.data ?? []).length - rows.length;
  if (!rows.length) return NextResponse.json({ ok: true, filled: 0, skipped });
  const { error } = await a.svc.from('schedule_shifts').insert(rows);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, filled: rows.length, skipped });
}
