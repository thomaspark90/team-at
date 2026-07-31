import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail } from '@/lib/finance/access';

// 로그인 필요한 경로(전체 구글 통일). 재무의 역할 체크는 /finance 페이지에서 추가로 함.
const PROTECTED = ['/dashboard', '/studio', '/garden', '/finance'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth = PROTECTED.some((p) => path === p || path.startsWith(p + '/'));
  if (!user && needsAuth) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  // 로그인은 됐지만 팀 도메인(@team-at.space)/대표가 아니면 보호 경로 차단(기존 세션 대비).
  if (user && needsAuth && !isAllowedEmail(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = 'denied=1';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // PROTECTED 경로에서만 실행 — 그 외(/, /api/*, /s/* 등)에서 매 요청 Supabase 인증 왕복이
  // 발생하던 것을 제거. /api 는 각 라우트가, / 는 페이지가 자체 인증 확인.
  matcher: ['/dashboard/:path*', '/studio/:path*', '/garden/:path*', '/finance/:path*'],
};
