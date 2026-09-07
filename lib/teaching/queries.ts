import type { SupabaseClient } from '@supabase/supabase-js';
import { PROFILE_COLS, type Profile } from '@/lib/teaching/access';
import type { StoreId } from '@/lib/types';

// 교육 기능 공용 조회 — API 라우트들이 같은 계산을 반복하지 않게 모아둔다.

export interface Received {
  sessionId: number;
  date: string;
  store: StoreId;
  managerName: string;
  createdAt: string;
}

/** 프로필 여러 건을 user_id → Profile 맵으로 */
export async function profileMap(svc: SupabaseClient, userIds?: string[]): Promise<Map<string, Profile>> {
  let q = svc.from('profiles').select(PROFILE_COLS);
  if (userIds) {
    if (userIds.length === 0) return new Map();
    q = q.in('user_id', Array.from(new Set(userIds)));
  }
  const { data } = await q;
  return new Map(((data ?? []) as Profile[]).map((p) => [p.user_id, p]));
}

/** 사용자별·주제별 마지막 참석 기록 — 위시가 '받음'인지 판정하는 근거 */
export async function lastReceivedMap(
  svc: SupabaseClient,
  userIds: string[],
): Promise<Map<string, Received>> {
  const out = new Map<string, Received>();
  if (userIds.length === 0) return out;
  const { data: att } = await svc
    .from('teaching_session_attendees')
    .select('user_id, session_id')
    .in('user_id', userIds);
  const sessionIds = Array.from(new Set((att ?? []).map((a) => a.session_id as number)));
  if (sessionIds.length === 0) return out;
  const { data: sessions } = await svc
    .from('teaching_sessions')
    .select('id, topic_key, date, store, manager_id, created_at')
    .in('id', sessionIds);
  const managers = await profileMap(svc, (sessions ?? []).map((s) => s.manager_id as string));
  const byId = new Map((sessions ?? []).map((s) => [s.id as number, s]));
  for (const a of att ?? []) {
    const s = byId.get(a.session_id as number);
    if (!s) continue;
    const key = `${a.user_id}:${s.topic_key}`;
    const prev = out.get(key);
    if (!prev || new Date(s.created_at as string) > new Date(prev.createdAt)) {
      out.set(key, {
        sessionId: s.id as number,
        date: s.date as string,
        store: s.store as StoreId,
        managerName: managers.get(s.manager_id as string)?.display_name ?? '매니저',
        createdAt: s.created_at as string,
      });
    }
  }
  return out;
}

/** 요청 이후 참석 기록이 있으면 받음 */
export const isFulfilled = (requestedAt: string, r: Received | undefined) =>
  !!r && new Date(r.createdAt) >= new Date(requestedAt);

/** 오늘(KST) 이후 일정 — 매니저 이름 포함 */
export async function upcomingShifts(svc: SupabaseClient, fromYmd: string, toYmd: string, store?: StoreId) {
  let q = svc
    .from('teaching_shifts')
    .select('id, manager_id, date, store, created_by')
    .gte('date', fromYmd)
    .lte('date', toYmd)
    .order('date');
  if (store) q = q.eq('store', store);
  const { data } = await q;
  const managers = await profileMap(svc, (data ?? []).map((s) => s.manager_id as string));
  return (data ?? []).map((s) => ({
    id: s.id as number,
    managerId: s.manager_id as string,
    managerName: managers.get(s.manager_id as string)?.display_name ?? '매니저',
    date: s.date as string,
    store: s.store as StoreId,
  }));
}
