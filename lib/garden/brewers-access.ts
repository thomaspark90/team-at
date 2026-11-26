// 서버 전용 — 「필터커피 내리는 사람」 명단을 고칠 수 있는 사람 판정. 클라이언트에서 import 금지.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOwner } from '@/lib/finance/access';
import { requireGardenTab } from '@/lib/access/guard';

// 서브 매니저 이상(2026-11-26 대표 결정) — 직원 명부의 책임 태그 키. 지점 구분 없이 두 지점 명단을 모두 고칠 수 있다.
// 책임 태그는 명부에서 추가 · 편집할 수 있는 값이라, 새 직급을 만들면 여기에도 넣어야 권한이 붙는다.
export const BREWER_EDIT_DUTIES = ['sub_manager', 'manager', 'general_manager'];

/**
 * 고칠 수 있는 사람 — 대표, 가든 설정 탭 권한이 있는 계정, 그리고 로그인 계정이 직원 명부에 연결돼 있고
 * 재직 중이며 책임 태그가 서브 매니저 이상인 사람. 명부에 계정이 연결돼 있지 않으면 직급으로는 판정할 수 없다.
 */
/**
 * 「내리는 사람」 표에서 근무 지점(직원 명부의 stores)까지 고칠 수 있는 사람 — 직원 명부와 같은 기준(대표 + 스케줄 탭이 있는 운영진).
 * 실제 저장은 /api/garden-schedule/staff 가 같은 기준으로 다시 판정한다. 여기서는 화면이 근무 지점 칸을 보일지만 정한다.
 */
export async function canEditStaffStores(
  supabase: SupabaseClient,
  svc: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<boolean> {
  if (isOwner(user.email)) return true;
  if (await requireGardenTab(supabase, user, 'schedule')) return false;
  const { data } = await svc.from('schedule_editors').select('email').eq('email', (user.email ?? '').toLowerCase()).maybeSingle();
  return !!data;
}

export async function canEditBrewers(
  supabase: SupabaseClient,
  svc: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<boolean> {
  if (isOwner(user.email)) return true;
  if (!(await requireGardenTab(supabase, user, 'settings'))) return true;
  const { data } = await svc.from('schedule_staff').select('duty_tag, active').eq('user_id', user.id).maybeSingle();
  return !!data?.active && BREWER_EDIT_DUTIES.includes(String(data.duty_tag ?? ''));
}
