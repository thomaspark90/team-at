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
// ⚠️ 입장 검사(미들웨어·로그인 콜백·PUBLIC_API 라우트)에는 이것 대신 isAllowedUser 를 쓸 것 —
// 설정에서 등록한 외부 이메일(finance.allowed_emails)까지 포함해야 한다.
export const isAllowedEmail = (email?: string | null): boolean =>
  !!email && (isOwner(email) || email.toLowerCase().endsWith('@' + TEAM_DOMAIN));

// 허용 판정의 완전판: 팀 도메인/대표는 즉시 통과, 그 외(gmail 등 외부 계정)는
// finance.allowed_emails 허용 목록을 조회한다(설정 > 페이지 접근 권한에서 관리).
// RLS 는 본인 이메일 행만 조회를 허용하므로 로그인 사용자 세션 클라이언트로 호출해야 한다.
export async function isAllowedUser(
  supabase: SupabaseClient,
  email?: string | null
): Promise<boolean> {
  if (isAllowedEmail(email)) return true;
  if (!email) return false;
  const { data } = await supabase
    .schema('finance')
    .from('allowed_emails')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  return !!data;
}

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

// 브랜드 스코프 — null = 전체, 'staffmeal'|'garden' = 해당 브랜드 거래만.
// ⚠️ RLS 헬퍼 finance.my_brand_scope() 의 판정과 동일하게 유지할 것.
export type BrandScope = 'staffmeal' | 'garden' | null;

// 역할+브랜드 스코프 일괄 조회. OWNER 는 항상 admin·전체.
export async function resolveMember(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<{ role: Role | null; brandScope: BrandScope }> {
  if (isOwner(user.email)) return { role: 'admin', brandScope: null };
  const { data } = await supabase
    .schema('finance')
    .from('members')
    .select('role,brand_scope')
    .eq('id', user.id)
    .maybeSingle();
  return {
    role: ((data?.role as Role | undefined) ?? null) || null,
    brandScope: ((data?.brand_scope as BrandScope | undefined) ?? null) || null,
  };
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
