import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { isOwner, resolveRole } from '@/lib/finance/access';
import { requireGardenTab } from '@/lib/access/guard';
import type { StoreId } from '@/lib/types';

// 교육 기능의 행위자 판정 — 프로필 역할(staff/manager) + 대표/관리자(admin).
// 화면에서 숨기는 것과 별개로 모든 쓰기 API 가 이 판정을 거친다(RLS 는 정책 없이 닫혀 있음).

export type TeachingRole = 'admin' | 'manager' | 'staff';

export interface Profile {
  user_id: string;
  display_name: string;
  role: 'staff' | 'manager';
  stores: StoreId[];
  simple_login: boolean;
  pin_reset_required: boolean;
}

export interface Actor {
  userId: string;
  email: string;
  role: TeachingRole;
  profile: Profile | null; // 대표·프로필 미작성 구글 계정은 null
  svc: SupabaseClient;
  session: SupabaseClient;
}

export const PROFILE_COLS = 'user_id, display_name, role, stores, simple_login, pin_reset_required';

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

  const { data: profile } = await svc.from('profiles').select(PROFILE_COLS).eq('user_id', user.id).maybeSingle();
  let role: TeachingRole = (profile?.role as TeachingRole | undefined) ?? 'staff';
  if (isOwner(user.email) || (await resolveRole(session, user)) === 'admin') role = 'admin';

  return { userId: user.id, email: user.email ?? '', role, profile: (profile as Profile | null) ?? null, svc, session };
}

export const isActor = (x: Actor | NextResponse): x is Actor => !(x instanceof NextResponse);

export const canManage = (a: Actor) => a.role === 'admin' || a.role === 'manager';
export const forbid = (msg = '매니저·대표만 할 수 있습니다.') => NextResponse.json({ error: msg }, { status: 403 });
