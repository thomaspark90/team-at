import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TA_ACCESS_HEADER } from './sections';
import { resolveRole, resolveMember, type Role, type BrandScope } from '@/lib/finance/access';

// 미들웨어가 회계/리포트(finance) 페이지 요청에서 이미 조회해 둔 role/brandScope 를
// x-ta-access 헤더로 읽는다 — 있으면 페이지의 finance.members 재조회를 생략.
// 스탬프가 없거나(로컬 개발·미들웨어 우회 등) uid 가 안 맞으면 안전하게 DB에서 직접 조회한다.
// ⚠️ next/headers 를 쓰므로 middleware.ts 에서는 절대 import 하지 말 것(Edge 런타임에서 깨짐) —
// 서버 컴포넌트(페이지)에서만 사용.
async function readStamp(uid: string): Promise<{ role: Role | null; brandScope: BrandScope } | null> {
  try {
    const h = await headers();
    const raw = h.get(TA_ACCESS_HEADER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: string; role?: Role | null; brandScope?: BrandScope };
    if (parsed.uid !== uid || !('role' in parsed)) return null;
    return { role: parsed.role ?? null, brandScope: parsed.brandScope ?? null };
  } catch {
    return null;
  }
}

export async function resolveRoleStamped(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<Role | null> {
  const stamped = await readStamp(user.id);
  if (stamped) return stamped.role;
  return resolveRole(supabase, user);
}

export async function resolveMemberStamped(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<{ role: Role | null; brandScope: BrandScope }> {
  const stamped = await readStamp(user.id);
  if (stamped) return stamped;
  return resolveMember(supabase, user);
}
