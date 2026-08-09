import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// 서버(서버 컴포넌트·route handler)용 Supabase 클라이언트
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 서버 컴포넌트에서 호출되면 무시(세션 갱신은 미들웨어가 담당)
          }
        },
      },
    }
  );
}

// 보호 페이지(서버 컴포넌트) 전용 — 미들웨어가 이 요청을 이미 auth.getUser()(원격 검증)로
// 통과시켰으므로, 페이지에서는 쿠키만 로컬 디코드하는 getSession()으로 충분하다(네트워크 왕복 없음).
// ⚠️ 미들웨어를 거치지 않는 경로(route handler 등)에서는 쓰지 말 것 — 그런 곳은 auth.getUser()를 써야 한다.
export async function getSessionUser(supabase: SupabaseClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}
