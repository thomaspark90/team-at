import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { isOwner, resolveRole } from '@/lib/finance/access';
import { requireGardenTab } from '@/lib/access/guard';
import { loadRoles, manageRoleKeys, type ProfileRole } from '@/lib/account/roles';
import type { StoreId } from '@/lib/types';

// 교육 기능의 행위자 판정 — 프로필 역할(finance.profile_roles, 대표가 관리) + 대표/관리자(admin).
// 역할의 의미는 can_manage 하나: 교육 운영(일정·집계·기록) 가능 여부. 코드는 역할 키를 직접 비교하지 않는다.
// 화면에서 숨기는 것과 별개로 모든 쓰기 API 가 이 판정을 거친다(RLS 는 정책 없이 닫혀 있음).

/** 'admin' 은 대표·finance admin, 그 외는 profile_roles.key */
export type TeachingRole = 'admin' | string;

export interface Profile {
  user_id: string;
  display_name: string;
  role: string;
  stores: StoreId[];
  simple_login: boolean;
  pin_reset_required: boolean;
  can_view_comments?: boolean; // 교육 코멘트 열람(대표 지정)
}

export interface Actor {
  userId: string;
  email: string;
  role: TeachingRole;
  manage: boolean; // 교육 운영 권한(admin 또는 can_manage 역할)
  roles: ProfileRole[];
  manageKeys: Set<string>; // can_manage 역할 키 — 다른 프로필의 매니저/스탭 구분에 사용
  profile: Profile | null; // 대표·프로필 미작성 구글 계정은 null
  svc: SupabaseClient;
  session: SupabaseClient;
}

export const PROFILE_COLS = 'user_id, display_name, role, stores, simple_login, pin_reset_required, can_view_comments';

/** 로그인 + 가든 교육 탭 권한 + 프로필 역할까지 한 번에. 실패 시 NextResponse 를 돌려준다. */
export async function requireActor(): Promise<Actor | NextResponse> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(session, user, 'teaching');
  if (denied) return denied;
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const [{ data: profile }, roles] = await Promise.all([
    svc.from('profiles').select(PROFILE_COLS).eq('user_id', user.id).maybeSingle(),
    loadRoles(svc),
  ]);
  const manageKeys = manageRoleKeys(roles);
  let role: TeachingRole = (profile?.role as string | undefined) ?? 'staff';
  if (isOwner(user.email) || (await resolveRole(session, user)) === 'admin') role = 'admin';
  const manage = role === 'admin' || manageKeys.has(role);

  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    manage,
    roles,
    manageKeys,
    profile: (profile as Profile | null) ?? null,
    svc,
    session,
  };
}

export const isActor = (x: Actor | NextResponse): x is Actor => !(x instanceof NextResponse);

export const canManage = (a: Actor) => a.manage;
/** 교육 코멘트 열람 — 대표·설정에서 지정된 계정. (작성자 본인 일정은 조회부에서 따로 허용) */
export const canViewComments = (a: Actor) => a.role === 'admin' || !!a.profile?.can_view_comments;
/** 다른 프로필이 매니저급인지 — 역할 키 대신 can_manage 로 판정 */
export const isManagerProfile = (a: Actor, p: Profile) => a.manageKeys.has(p.role);
export const forbid = (msg = '매니저·대표만 할 수 있습니다.') => NextResponse.json({ error: msg }, { status: 403 });
