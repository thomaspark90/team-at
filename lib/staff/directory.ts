import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffNameRow } from '@/lib/staff/names';
import type { StoreId } from '@/lib/types';

// 직원 명부(finance.schedule_staff) 와 계정(finance.profiles) 연결 — 명부가 재직·이름의 정본.
// 계정은 필요한 사람만 있다. 교육 기록 등이 계정에 묶여 있어 퇴사해도 계정 행은 지우지 않는다.

const BAN_FOREVER = '876000h'; // 100년 — Supabase 는 '영구' 값이 없다

export async function staffNameRows(svc: SupabaseClient): Promise<StaffNameRow[]> {
  const { data, error } = await svc.from('schedule_staff').select('name, active');
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffNameRow[];
}

/** 드롭다운용 재직자 이름. */
export const activeNames = (rows: StaffNameRow[]) =>
  rows
    .filter((r) => r.active)
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b, 'ko'));

/** 계정을 명부에 연결 — 같은 이름이 있으면 연결, 없으면 create 일 때 새로 만든다. 승인·등록을 막지 않게 실패는 로그만. */
export async function ensureStaffLink(
  svc: SupabaseClient,
  a: { userId: string; name: string; store: StoreId | undefined; create?: boolean },
): Promise<void> {
  const { data: linked } = await svc.from('schedule_staff').select('id').eq('user_id', a.userId).maybeSingle();
  if (linked) return;
  const { data: row } = await svc.from('schedule_staff').select('id, user_id').eq('name', a.name).maybeSingle();
  if (row?.user_id) return; // 같은 이름이 다른 계정에 연결돼 있음 — 임의로 옮기지 않는다
  const { error } = row
    ? await svc.from('schedule_staff').update({ user_id: a.userId, active: true }).eq('id', row.id)
    : a.create !== false && a.store
      ? await svc.from('schedule_staff').insert({ name: a.name, home_store: a.store, stores: [a.store], user_id: a.userId })
      : { error: null };
  if (error) console.error('직원 명부 연결 실패:', a.name, error.message);
}

/** 계정 쪽에서 이름을 바꿨을 때 명부도 맞춘다. */
export async function syncStaffName(svc: SupabaseClient, userId: string, name: string): Promise<void> {
  const { error } = await svc.from('schedule_staff').update({ name }).eq('user_id', userId);
  if (error) console.error('직원 명부 이름 반영 실패:', name, error.message);
}

/** 퇴사/복귀에 맞춰 계정을 잠그거나 연다. 가입 대기 계정은 건드리지 않는다. 실패하면 throw — 재직 표시만 바뀌는 일이 없게. */
export async function setAccountLeft(svc: SupabaseClient, userId: string, left: boolean): Promise<void> {
  const { data: p } = await svc.from('profiles').select('status').eq('user_id', userId).maybeSingle();
  if (p?.status === 'pending') return;
  const { error: banErr } = await svc.auth.admin.updateUserById(userId, { ban_duration: left ? BAN_FOREVER : 'none' });
  if (banErr) throw new Error(banErr.message);
  if (left) {
    const { error } = await svc.rpc('revoke_user_sessions', { uid: userId });
    if (error) throw new Error(error.message);
  }
  if (p) {
    const { error } = await svc.from('profiles').update({ status: left ? 'left' : 'active', updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}
