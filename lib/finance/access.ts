import type { SupabaseClient } from '@supabase/supabase-js';

export type Role = 'admin' | 'classifier' | 'viewer';

// 최초 관리자(대표) — 이 계정은 members 등록 없이도 코드에서 admin 으로 인식.
// ⚠️ RLS 정책(members read/manage)의 이메일과 반드시 동일하게 유지할 것.
export const OWNER_EMAIL = 'thomas.in.park@gmail.com';

export const isOwner = (email?: string | null): boolean =>
  !!email && email.toLowerCase() === OWNER_EMAIL;

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
