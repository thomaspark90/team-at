import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { weekStartOf } from '@/lib/schedule/time';
import { monthRange, monthlyRows } from '@/lib/schedule/monthly';
import type { Shift } from '@/lib/schedule/types';

export const runtime = 'nodejs';

// GET ?store&month=YYYY-MM — 지점·월의 사람별 근무시간 집계(운영진 전용). 실제 = 실제 기록 우선, 없으면 배포된 계획.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const u = new URL(req.url);
  const store = u.searchParams.get('store');
  const month = u.searchParams.get('month') ?? '';
  if (!isStore(store)) return badRequest('지점을 선택하세요.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return badRequest('월이 올바르지 않습니다.');
  const [from, to] = monthRange(month);
  const [shifts, weeks, staff] = await Promise.all([
    a.svc.from('schedule_shifts').select('id, work_date, store, staff_id, kind, start_min, end_min, is_off, source, uncertain').eq('store', store).gte('work_date', from).lte('work_date', to),
    a.svc.from('schedule_weeks').select('store, week_start').eq('store', store).eq('status', 'published').gte('week_start', weekStartOf(from)).lte('week_start', to),
    a.svc.from('schedule_staff').select('id, name, active, employment, hourly_wage'),
  ]);
  const err = shifts.error ?? weeks.error ?? staff.error;
  if (err) return dbError(err);
  const list: Shift[] = (shifts.data ?? []).map((r: any) => ({ id: Number(r.id), date: r.work_date, store: r.store, staffId: Number(r.staff_id), kind: r.kind, start: r.start_min ?? undefined, end: r.end_min ?? undefined, isOff: r.is_off, source: r.source, uncertain: r.uncertain }));
  const published = new Set((weeks.data ?? []).map((w: any) => `${w.store}|${w.week_start}`));
  const info = new Map((staff.data ?? []).map((s: any) => [Number(s.id), s]));
  const rows = monthlyRows(list, published, weekStartOf, (id) => (info.get(id)?.hourly_wage == null ? null : Number(info.get(id).hourly_wage)))
    .map((r) => ({ ...r, name: info.get(r.staffId)?.name ?? String(r.staffId), active: !!info.get(r.staffId)?.active, employment: info.get(r.staffId)?.employment ?? 'regular', hourlyWage: info.get(r.staffId)?.hourly_wage ?? null }))
    .sort((x, y) => x.name.localeCompare(y.name, 'ko'));
  return NextResponse.json({ month, store, rows });
}
