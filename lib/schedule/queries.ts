import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoreId } from '@/lib/types';
import type { Shift, Staff, WeekData } from './types';
import { weekDays } from './time';
import { addDays } from '@/lib/teaching/kst';
import { diffSnapshots, isSnapshot, snapshotOf } from './publish-diff';
import { streakEndingAt } from './warnings';
import { loadTags } from './tags';

// 주간 조회 — 앱 탭과 공유 링크가 함께 쓴다. 공개 범위 필터는 여기 한 곳.

/* eslint-disable @typescript-eslint/no-explicit-any */
export const toStaff = (r: any): Staff => ({
  id: Number(r.id),
  name: r.name,
  homeStore: r.home_store,
  stores: Array.isArray(r.stores) && r.stores.length ? r.stores : [r.home_store],
  joinedOn: r.joined_on,
  active: r.active,
  roles: Array.isArray(r.roles) ? r.roles : [],
  dutyTag: r.duty_tag ?? null,
  employment: r.employment === 'part_time' ? 'part_time' : 'regular',
  weeklyHours: r.weekly_hours == null ? null : Number(r.weekly_hours),
});

const toShift = (r: any): Shift => ({
  id: Number(r.id),
  date: r.work_date,
  store: r.store,
  staffId: Number(r.staff_id),
  kind: r.kind,
  start: r.start_min ?? undefined,
  end: r.end_min ?? undefined,
  isOff: r.is_off,
  source: r.source,
  uncertain: r.uncertain,
});

const SHIFT_COLS = 'id, work_date, store, staff_id, kind, start_min, end_min, is_off, source, uncertain';

/**
 * editor: 전 지점의 계획·실제 + 메모 + 재직 명부.
 * 그 외: 배포된 주의 계획만, 그 근무자 이름만(메모·실제·미배포 계획은 응답에 싣지 않는다).
 * 다른 지점 근무도 함께 내려 한 사람의 주간을 온전히 보여준다.
 */
export async function loadWeek(svc: SupabaseClient, store: StoreId, weekStart: string, editor: boolean): Promise<WeekData> {
  const days = weekDays(weekStart);
  const dayBefore = addDays(days[0], -1);
  const [weeksRes, shiftsRes, staffRes, notesRes, presetsRes, leavesRes, reqRes, priorRes, acksRes, roles] = await Promise.all([
    svc.from('schedule_weeks').select('store, status, published_at, snapshot, prev_snapshot').eq('week_start', weekStart),
    svc.from('schedule_shifts').select(SHIFT_COLS).gte('work_date', days[0]).lte('work_date', days[6]).order('start_min'),
    svc.from('schedule_staff').select('id, name, home_store, stores, joined_on, active, roles, employment, weekly_hours, duty_tag').order('name'),
    editor
      ? svc.from('schedule_day_notes').select('work_date, note').eq('store', store).gte('work_date', days[0]).lte('work_date', days[6])
      : Promise.resolve({ data: [], error: null }),
    svc.from('schedule_shift_presets').select('label, start_min, end_min').eq('store', store).order('position'),
    editor
      ? svc.from('leave_records').select('staff_id, leave_date, type').gte('leave_date', days[0]).lte('leave_date', days[6])
      : Promise.resolve({ data: [], error: null }),
    editor
      ? svc.from('leave_requests').select('staff_id, leave_date, type').eq('status', 'pending').gte('leave_date', days[0]).lte('leave_date', days[6])
      : Promise.resolve({ data: [], error: null }),
    // 연속 근무 판정용 — 주 시작 전 6일의 근무일(전 지점, 계획)
    editor
      ? svc.from('schedule_shifts').select('staff_id, work_date').eq('kind', 'plan').eq('is_off', false).not('start_min', 'is', null).gte('work_date', addDays(days[0], -6)).lte('work_date', dayBefore)
      : Promise.resolve({ data: [], error: null }),
    svc.from('schedule_publish_acks').select('staff_id, published_at').eq('store', store).eq('week_start', weekStart),
    loadTags(svc, 'role'),
  ]);
  const err = weeksRes.error ?? shiftsRes.error ?? staffRes.error ?? notesRes.error ?? presetsRes.error ?? leavesRes.error ?? reqRes.error ?? priorRes.error ?? acksRes.error;
  if (err) throw new Error(err.message);

  const publishedStores = new Set((weeksRes.data ?? []).filter((w) => w.status === 'published').map((w) => w.store as string));
  const mine = (weeksRes.data ?? []).find((w) => w.store === store);
  const all = (shiftsRes.data ?? []).map(toShift);
  const shifts = editor ? all : all.filter((s) => s.kind === 'plan' && publishedStores.has(s.store));
  // 책임 태그는 운영진에게만(책임자 없는 시간대 경고용)
  const allStaff = (staffRes.data ?? []).map(toStaff).map((s) => (editor ? s : { ...s, dutyTag: null }));
  const onDuty = new Set(shifts.map((s) => s.staffId));

  const priorDates = new Map<number, Set<string>>();
  for (const r of priorRes.data ?? []) {
    const id = Number((r as any).staff_id);
    priorDates.set(id, (priorDates.get(id) ?? new Set()).add((r as any).work_date as string));
  }
  const streakBefore = Object.fromEntries(Array.from(priorDates, ([id, dates]) => [id, streakEndingAt(dates, dayBefore)]));
  const published = publishedStores.has(store);
  const snapshot = isSnapshot(mine?.snapshot) ? mine!.snapshot : null;
  const prevSnapshot = isSnapshot(mine?.prev_snapshot) ? mine!.prev_snapshot : null;
  const changes = published && snapshot && prevSnapshot ? diffSnapshots(prevSnapshot, snapshot) : [];
  const unpublishedChanges = editor && published && snapshot ? diffSnapshots(snapshot, snapshotOf(all.filter((s) => s.kind === 'plan' && s.store === store))).length : 0;
  const acked = (acksRes.data ?? []).filter((x: any) => mine?.published_at && x.published_at === mine.published_at).map((x: any) => Number(x.staff_id));
  // 직원 화면엔 근무자만 — 근무가 빠진 사람도 '바뀐 칸'에 이름이 나와야 하므로 함께 싣는다
  const changedIds = new Set(changes.map((c) => c.staffId));
  const staff = editor ? allStaff : allStaff.filter((s) => onDuty.has(s.id) || changedIds.has(s.id));

  return {
    weekStart,
    days,
    store,
    editor,
    published,
    publishedStores: Array.from(publishedStores) as StoreId[],
    publishedAt: (mine?.published_at as string | null) ?? null,
    staff,
    shifts,
    notes: Object.fromEntries((notesRes.data ?? []).map((n: any) => [n.work_date, n.note])),
    presets: (presetsRes.data ?? []).map((p: any) => ({ label: p.label, start: p.start_min, end: p.end_min })),
    roles,
    leaves: [
      ...(leavesRes.data ?? []).map((l: any) => ({ staffId: Number(l.staff_id), date: l.leave_date, type: l.type })),
      ...(reqRes.data ?? []).map((l: any) => ({ staffId: Number(l.staff_id), date: l.leave_date, type: l.type, pending: true })),
    ],
    streakBefore,
    changes,
    unpublishedChanges,
    acked,
  };
}
