import type { SupabaseClient } from '@supabase/supabase-js';
import { kstToday } from '@/lib/teaching/kst';
import { STORES, type StoreId } from '@/lib/types';
import { canTakeOver } from './assignment';
import type { ChecklistActor } from './access';
import { isOnCrew, loadCrews } from './crew';
import { isClosedDay, isEnabledStore, isMissed, itemsDue, STORE_START } from './logic';
import { SHIFT_TYPES, type ChecklistCard, type ChecklistCheck, type ChecklistDay, type ChecklistItem, type CrewPlan, type ShiftType } from './types';

// 조회·쓰기 공용 — 조 구성은 lib/checklist/crew 가 근무표·수정값에서 매번 계산한다(스케줄을 고치면 바로 반영).

const ITEM_COLS = 'id, store, shift_type, section, label, detail, frequency, weekday, photo_required, active, origin, sort_order';
const CHECK_COLS = 'id, run_id, item_id, status, skip_reason, photo_path, photo_taken_at, photo_deleted_at, done_by_name, done_at';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const toItem = (r: any): ChecklistItem => ({
  id: Number(r.id),
  store: r.store,
  shiftType: r.shift_type,
  section: r.section,
  label: r.label,
  detail: r.detail,
  frequency: r.frequency,
  weekday: r.weekday,
  photoRequired: r.photo_required,
  active: r.active,
  origin: r.origin,
  sortOrder: r.sort_order,
});

export const toCheck = (r: any): ChecklistCheck => ({
  id: Number(r.id),
  itemId: Number(r.item_id),
  status: r.status,
  skipReason: r.skip_reason,
  hasPhoto: !!r.photo_path,
  photoExpired: !!r.photo_deleted_at,
  photoTakenAt: r.photo_taken_at,
  doneByName: r.done_by_name,
  doneAt: r.done_at,
});

export const loadItems = async (svc: SupabaseClient, store?: StoreId): Promise<ChecklistItem[]> => {
  let q = svc.from('checklist_items').select(ITEM_COLS).order('sort_order').order('id');
  if (store) q = q.eq('store', store);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(toItem);
};

/** 화면 하루치 — 직원은 오늘 자기 조만, 운영진은 그날 운영 지점 전체. */
export async function loadDay(svc: SupabaseClient, date: string, actor: ChecklistActor): Promise<ChecklistDay> {
  const today = kstToday();
  const { editor, staffId } = actor;
  const [crews, items, runsRes] = await Promise.all([
    loadCrews(svc, date),
    loadItems(svc),
    svc.from('checklist_runs').select('id, store, shift_type, submitted_at, submitted_by_name, items_snapshot').eq('work_date', date),
  ]);
  if (runsRes.error) throw new Error(runsRes.error.message);
  const runs = runsRes.data ?? [];
  const runIds = runs.map((r: any) => r.id);
  const [checksRes, reopensRes] = runIds.length
    ? await Promise.all([
        svc.from('checklist_checks').select(CHECK_COLS).in('run_id', runIds),
        svc.from('checklist_reopens').select('run_id, reopened_by_name, reopened_at').in('run_id', runIds).order('reopened_at'),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (checksRes.error) throw new Error(checksRes.error.message);
  if (reopensRes.error) throw new Error(reopensRes.error.message);

  const openStores = STORES.map((s) => s.id).filter((s) => editor || isEnabledStore(s));
  const cards: ChecklistCard[] = [];
  const takeoverOptions: ChecklistDay['takeoverOptions'] = [];
  const unlinked = new Set<string>();
  for (const store of openStores) {
    if (isClosedDay(store, date)) continue;
    for (const shiftType of SHIFT_TYPES) {
      const crew = crews.of(store, shiftType);
      const run = runs.find((r: any) => r.store === store && r.shift_type === shiftType);
      const members = crew.memberIds.map((id) => {
        const p = crews.people.get(id)!;
        return { id, name: p.name, linked: p.linked };
      });
      members.filter((m) => !m.linked).forEach((m) => unlinked.add(m.name));
      const onCrew = staffId != null && crew.memberIds.includes(staffId);
      if (date === today && isEnabledStore(store) && !onCrew && !run?.submitted_at && canTakeOver(actor, store)) takeoverOptions.push({ store, shiftType });
      if (!editor && !(onCrew && date === today)) continue;
      // 운영 시작 전 지난 날짜에 기록도 없으면 카드를 만들지 않는다
      const start = STORE_START[store];
      if (!run && date < today && (!start || date < start)) continue;
      const snapshot = run?.submitted_at ? (run.items_snapshot as ChecklistItem[] | null) : null;
      cards.push({
        store,
        date,
        shiftType,
        members,
        leadId: crew.leadId,
        onCrew,
        isLead: staffId != null && crew.leadId === staffId,
        missed: isMissed(store, date, today, run?.submitted_at ?? null),
        takeovers: crew.takeovers.map((t) => ({ name: t.name, at: t.at })),
        reopens: run ? (reopensRes.data ?? []).filter((x: any) => x.run_id === run.id).map((x: any) => ({ name: x.reopened_by_name, at: x.reopened_at })) : [],
        submittedAt: run?.submitted_at ?? null,
        submittedByName: run?.submitted_by_name ?? null,
        items: snapshot ?? itemsDue(items.filter((i) => i.store === store && i.shiftType === shiftType), date),
        checks: run ? (checksRes.data ?? []).filter((c: any) => c.run_id === run.id).map(toCheck) : [],
      });
    }
  }

  return {
    date,
    today,
    editor,
    canAct: date === today,
    linked: staffId != null,
    closedStores: openStores.filter((s) => isClosedDay(s, date)),
    unpublishedStores: openStores.filter((s) => !isClosedDay(s, date) && !crews.published.has(s)),
    unlinked: editor ? Array.from(unlinked) : [],
    takeoverOptions,
    cards,
  };
}

/** 조 편성 화면 — 그 지점 재직자 + 그날 조에 든 사람. */
export async function loadCrewPlan(svc: SupabaseClient, store: StoreId, date: string): Promise<CrewPlan> {
  const [crews, runsRes] = await Promise.all([
    loadCrews(svc, date),
    svc.from('checklist_runs').select('shift_type, submitted_at').eq('store', store).eq('work_date', date),
  ]);
  if (runsRes.error) throw new Error(runsRes.error.message);
  const onDuty = new Set(SHIFT_TYPES.flatMap((t) => crews.of(store, t).memberIds));
  const plan = (t: ShiftType) => {
    const c = crews.of(store, t);
    return {
      autoIds: c.autoIds,
      memberIds: c.memberIds,
      leadId: c.leadId,
      pinnedLeadId: c.override.leadStaffId,
      submitted: (runsRes.data ?? []).some((r: any) => r.shift_type === t && r.submitted_at),
    };
  };
  return {
    date,
    store,
    editable: date >= kstToday(),
    published: crews.published.has(store),
    people: Array.from(crews.people.values())
      .filter((p) => onDuty.has(p.id) || (p.active && p.homeStore === store))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((p) => ({ id: p.id, name: p.name, linked: p.linked })),
    crews: { open: plan('open'), close: plan('close') },
  };
}

/** 체크 대상 항목 + 쓸 수 있는 run — 오늘·운영 지점·조 인원(또는 운영진)·미제출만 통과. 실패 시 문구. */
export async function openRun(
  svc: SupabaseClient,
  actor: { staffId: number | null; editor: boolean },
  input: { store: StoreId; date: string; shiftType: ShiftType },
): Promise<{ runId: number } | { error: string; status: number }> {
  if (input.date !== kstToday()) return { error: '오늘 체크리스트만 기록할 수 있습니다.', status: 400 };
  if ((!isEnabledStore(input.store) && !actor.editor) || isClosedDay(input.store, input.date)) return { error: '오늘 이 지점은 체크리스트가 없습니다.', status: 400 };
  if (!actor.editor && !(await isOnCrew(svc, input.store, input.date, input.shiftType, actor.staffId))) {
    return { error: '오늘 이 체크리스트의 담당이 아닙니다.', status: 403 };
  }
  const { data, error } = await svc
    .from('checklist_runs')
    .upsert({ store: input.store, work_date: input.date, shift_type: input.shiftType }, { onConflict: 'store,work_date,shift_type' })
    .select('id, submitted_at')
    .single();
  if (error) return { error: error.message, status: 500 };
  if (data.submitted_at) return { error: '이미 제출된 체크리스트입니다.', status: 409 };
  return { runId: Number(data.id) };
}
