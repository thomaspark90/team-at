import type { SupabaseClient } from '@supabase/supabase-js';
import { weekStartOf } from '@/lib/schedule/time';
import type { DutyTag, Shift } from '@/lib/schedule/types';
import type { StoreId } from '@/lib/types';
import { NO_OVERRIDE, resolveCrew, type CrewOverride, type CrewPerson } from './assignment';
import { assignmentsFor } from './logic';
import type { ShiftType } from './types';

// 하루치 조 구성 읽기 — 근무표·운영진 수정·대신 맡기를 모아 판정 함수에 넘긴다. 쓰기 라우트의 권한 판정도 이것을 쓴다.

export interface Crew {
  autoIds: number[];
  memberIds: number[];
  leadId: number | null;
  override: CrewOverride;
  takeovers: { staffId: number; name: string; at: string }[];
}

export interface DayCrews {
  published: Set<string>;
  people: Map<number, CrewPerson & { active: boolean; homeStore: StoreId }>;
  of: (store: StoreId, shiftType: ShiftType) => Crew;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
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

const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : []);

export async function loadCrews(svc: SupabaseClient, date: string): Promise<DayCrews> {
  const [weeks, shifts, staff, profiles, overrides, takeovers] = await Promise.all([
    svc.from('schedule_weeks').select('store, status').eq('week_start', weekStartOf(date)),
    svc.from('schedule_shifts').select('id, work_date, store, staff_id, kind, start_min, end_min, is_off, source, uncertain').eq('work_date', date),
    svc.from('schedule_staff').select('id, name, home_store, joined_on, active, duty_tag, user_id'),
    svc.from('profiles').select('user_id, status, roster_only'),
    svc.from('checklist_crew_overrides').select('store, shift_type, added_staff, removed_staff, lead_staff_id').eq('work_date', date),
    svc.from('checklist_takeovers').select('store, shift_type, staff_id, staff_name, taken_at').eq('work_date', date).order('taken_at'),
  ]);
  const err = weeks.error ?? shifts.error ?? staff.error ?? profiles.error ?? overrides.error ?? takeovers.error;
  if (err) throw new Error(err.message);

  const published = new Set((weeks.data ?? []).filter((w: any) => w.status === 'published').map((w: any) => w.store as string));
  const profileOf = new Map((profiles.data ?? []).map((p: any) => [p.user_id as string, p]));
  // 프로필이 없는 구글 계정도 로그인할 수 있다. 교육 명부 전용·대기·퇴사 계정은 로그인 불가로 본다.
  const canLogIn = (userId: string | null) => {
    if (!userId) return false;
    const p = profileOf.get(userId);
    return !p || (p.status === 'active' && !p.roster_only);
  };
  const people: DayCrews['people'] = new Map(
    (staff.data ?? []).map((s: any) => [
      Number(s.id),
      {
        id: Number(s.id),
        name: s.name as string,
        linked: canLogIn(s.user_id),
        dutyTag: (s.duty_tag as DutyTag | null) ?? null,
        joinedOn: (s.joined_on as string | null) ?? null,
        active: !!s.active,
        homeStore: s.home_store as StoreId,
      },
    ]),
  );
  const allShifts = (shifts.data ?? []).map(toShift);

  const of = (store: StoreId, shiftType: ShiftType): Crew => {
    const autoIds = assignmentsFor(allShifts, store, date, (s) => published.has(s.store))[shiftType];
    const row = (overrides.data ?? []).find((o: any) => o.store === store && o.shift_type === shiftType);
    const override: CrewOverride = row
      ? { added: nums(row.added_staff), removed: nums(row.removed_staff), leadStaffId: row.lead_staff_id == null ? null : Number(row.lead_staff_id) }
      : NO_OVERRIDE;
    const took = (takeovers.data ?? [])
      .filter((t: any) => t.store === store && t.shift_type === shiftType)
      .map((t: any) => ({ staffId: Number(t.staff_id), name: t.staff_name as string, at: t.taken_at as string }));
    return { autoIds, ...resolveCrew(autoIds, override, took.map((t) => t.staffId), people), override, takeovers: took };
  };
  return { published, people, of };
}

/** 이 사람이 그날 이 조인가 — 정기 휴무·미운영 판정은 호출하는 쪽에서. */
export async function isOnCrew(svc: SupabaseClient, store: StoreId, date: string, shiftType: ShiftType, staffId: number | null): Promise<boolean> {
  if (staffId == null) return false;
  return (await loadCrews(svc, date)).of(store, shiftType).memberIds.includes(staffId);
}

export async function saveOverride(svc: SupabaseClient, store: StoreId, date: string, shiftType: ShiftType, o: CrewOverride, byName: string) {
  const { error } = await svc.from('checklist_crew_overrides').upsert(
    {
      store,
      work_date: date,
      shift_type: shiftType,
      added_staff: o.added,
      removed_staff: o.removed,
      lead_staff_id: o.leadStaffId,
      updated_by_name: byName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'store,work_date,shift_type' },
  );
  if (error) throw new Error(error.message);
}
