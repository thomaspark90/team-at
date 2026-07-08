import type { SupabaseClient } from '@supabase/supabase-js';

// 활동 로그 기록 — 기능 성공 지점에서 호출. 실패해도 본 동작을 막지 않는다.
export async function logActivity(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  action: string,
  detail?: string | null
) {
  try {
    await supabase.schema('finance').from('activity_logs').insert({
      user_id: user.id,
      email: user.email ?? '',
      action,
      detail: detail ?? null,
    });
  } catch {
    /* 로깅 실패 무시 */
  }
}
