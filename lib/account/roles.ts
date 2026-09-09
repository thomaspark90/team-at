import type { SupabaseClient } from '@supabase/supabase-js';

// 간편 계정 역할 — finance.profile_roles. 대표가 설정에서 추가·편집한다.
// 역할의 의미는 can_manage 하나: true 면 교육 운영(매니저 화면), false 면 스탭 화면.

export type ProfileRole = { key: string; label: string; canManage: boolean; builtin: boolean; sort: number };

export const ROLE_LABEL_RE = /^[가-힣a-zA-Z0-9 ]{1,10}$/;

export async function loadRoles(svc: SupabaseClient): Promise<ProfileRole[]> {
  const { data } = await svc.from('profile_roles').select('key, label, can_manage, builtin, sort').order('sort').order('label');
  return ((data ?? []) as { key: string; label: string; can_manage: boolean; builtin: boolean; sort: number }[]).map((r) => ({
    key: r.key,
    label: r.label,
    canManage: r.can_manage,
    builtin: r.builtin,
    sort: r.sort,
  }));
}

export const roleMap = (roles: ProfileRole[]) => new Map(roles.map((r) => [r.key, r]));

/** 교육 운영 권한이 있는 역할 키 집합 */
export const manageRoleKeys = (roles: ProfileRole[]) => new Set(roles.filter((r) => r.canManage).map((r) => r.key));
