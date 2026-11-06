import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoreId } from '@/lib/types';
import type { Shift, Staff, WeekData } from './types';
import { weekDays } from './time';

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
  const [weeksRes, shiftsRes, staffRes, notesRes, presetsRes] = await Promise.all([
    svc.from('schedule_weeks').select('store, status, published_at').eq('week_start', weekStart),
    svc.from('schedule_shifts').select(SHIFT_COLS).gte('work_date', days[0]).lte('work_date', days[6]).order('start_min'),
    svc.from('schedule_staff').select('id, name, home_store, stores, joined_on, active, roles').order('name'),
    editor
      ? svc.from('schedule_day_notes').select('work_date, note').eq('store', store).gte('work_date', days[0]).lte('work_date', days[6])
      : Promise.resolve({ data: [], error: null }),
    svc.from('schedule_shift_presets').select('label, start_min, end_min').eq('store', store).order('position'),
  ]);
  const err = weeksRes.error ?? shiftsRes.error ?? staffRes.error ?? notesRes.error ?? presetsRes.error;
  if (err) throw new Error(err.message);

  const publishedStores = new Set((weeksRes.data ?? []).filter((w) => w.status === 'published').map((w) => w.store as string));
  const mine = (weeksRes.data ?? []).find((w) => w.store === store);
  const all = (shiftsRes.data ?? []).map(toShift);
  const shifts = editor ? all : all.filter((s) => s.kind === 'plan' && publishedStores.has(s.store));
  const allStaff = (staffRes.data ?? []).map(toStaff);
  const onDuty = new Set(shifts.map((s) => s.staffId));
  const staff = editor ? allStaff : allStaff.filter((s) => onDuty.has(s.id));

  return {
    weekStart,
    days,
    store,
    editor,
    published: publishedStores.has(store),
    publishedStores: Array.from(publishedStores) as StoreId[],
    publishedAt: (mine?.published_at as string | null) ?? null,
    staff,
    shifts,
    notes: Object.fromEntries((notesRes.data ?? []).map((n: any) => [n.work_date, n.note])),
    presets: (presetsRes.data ?? []).map((p: any) => ({ label: p.label, start: p.start_min, end: p.end_min })),
  };
}
