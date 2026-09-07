import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';

// service role 클라이언트 — RLS 를 우회하므로 반드시 코드 쪽 권한 판정을 먼저 통과한 뒤 쓴다.
// 기본 스키마를 finance 로 잡아 프로필·교육 테이블을 바로 다룬다. env 누락 시 null.
export function serviceClient(schema: 'finance' | 'public' = 'finance'): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // 스키마 제네릭은 호출부에서 문자열 테이블명으로만 쓰므로 기본형으로 넓힌다
  return createServiceClient(url, key, { db: { schema } }) as unknown as SupabaseClient;
}
