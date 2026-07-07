import type { SupabaseClient } from '@supabase/supabase-js';

export type Role = 'admin' | 'classifier' | 'viewer';

// 최초 관리자(대표) — 이 계정은 members 등록 없이도 코드에서 admin 으로 인식.
// ⚠️ RLS 정책(members read/manage)의 이메일과 반드시 동일하게 유지할 것.
export const OWNER_EMAIL = 'thomas.in.park@gmail.com';

// 앱 로그인 허용 도메인 — 팀 구글 계정.
export const TEAM_DOMAIN = 'team-at.space';

export const isOwner = (email?: string | null): boolean =>
  !!email && email.toLowerCase() === OWNER_EMAIL;

// 앱 접근 허용 정책: @team-at.space 팀 계정 또는 대표(gmail 예외).
// 이 판정에서 막히면 로그인 자체가 거부돼 스탭밀·가든·재무 어디도 못 들어옴.
export const isAllowedEmail = (email?: string | null): boolean =>
  !!email && (isOwner(email) || email.toLowerCase().endsWith('@' + TEAM_DOMAIN));

// 현재 사용자의 재무 역할. OWNER 는 항상 admin, 그 외엔 finance.members 조회.
export async function resolveRole(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<Role | null> {
  if (isOwner(user.email)) return 'admin';
  const { data } = await supabase
    .schema('finance')
    .from('members')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return ((data?.role as Role | undefined) ?? null) || null;
}

// 월 확정 권한. OWNER 는 항상 true, 그 외엔 finance.members.can_confirm.
// ⚠️ RLS 정책 finance.can_confirm() 의 판정과 동일하게 유지할 것.
export async function canConfirm(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<boolean> {
  if (isOwner(user.email)) return true;
  const { data } = await supabase
    .schema('finance')
    .from('members')
    .select('can_confirm')
    .eq('id', user.id)
    .maybeSingle();
  return !!(data?.can_confirm as boolean | undefined);
}
