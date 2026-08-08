import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail, isOwner } from '@/lib/finance/access';
import { SECTIONS, firstAllowedHref, sectionForPath, sectionsForApiPath } from '@/lib/access/sections';
import { GARDEN_TABS, tabForPath } from '@/lib/garden/tabs';

// 앱 전체 접근 통제의 단일 관문.
//  1) 보호 페이지: 로그인 + 팀 도메인(@team-at.space) + 사용자별 섹션/가든탭 권한
//  2) /api/*     : 로그인 + 팀 도메인 (라우트마다 개별 확인하던 것을 여기서 일괄 강제)
// 이렇게 두지 않으면 페이지는 막혀도 API 를 직접 호출해 같은 데이터를 가져갈 수 있다.

const PROTECTED = ['/dashboard', '/studio', '/garden', '/finance'];

// 세션 쿠키 없이 호출되는 API — 각 라우트가 토큰/서명으로 자체 인증한다.
// (외부 수집기·Blob 완료 웹훅·공개 단어 페이지)
const PUBLIC_API = [
  '/api/upload', // Blob 완료 웹훅은 쿠키가 없음 — 토큰 발급 시점에 라우트가 직접 확인
  '/api/garden-words', // 공개 제철 단어(익명 제출·조회) — 관리 동작은 라우트가 확인
  '/api/garden-reviews/ingest',
  '/api/garden-reviews/alert',
  '/api/garden-reviews/queue',
  '/api/finance/naverpay/ingest',
  '/api/finance/naverpay/alert',
  '/api/finance/naverpay/config', // 수집기가 실행 전 크롤 설정을 읽는다 — 토큰(x-naverpay-token) 자체 인증
  '/api/finance/coupang/ingest',
  '/api/finance/coupang/alert',
  '/api/cron/ingest-health', // Vercel 크론 — CRON_SECRET Bearer 로 자체 인증
  '/api/kakao-notify/queue', // 원두 발주 카톡 전송기(맥 로컬) — 토큰(x-kakao-token) 자체 인증
];

const isPublicApi = (p: string) => PUBLIC_API.some((a) => p === a || p.startsWith(a + '/'));

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

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith('/api/');
  if (isApi && isPublicApi(path)) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = isApi || PROTECTED.some((p) => path === p || path.startsWith(p + '/'));
  if (!needsAuth) return response;

  // getUser() 가 토큰을 갱신하면 새 쿠키가 response 에만 실린다. 리다이렉트·에러 응답을
  // 새로 만들면 그 쿠키가 유실돼 간헐적으로 로그아웃되므로, 항상 옮겨 붙인다.
  const withCookies = (res: NextResponse) => {
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  const deny = (status: number, message: string) => {
    if (isApi) return withCookies(NextResponse.json({ error: message }, { status }));
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = status === 403 ? 'denied=1' : '';
    return withCookies(NextResponse.redirect(url));
  };

  if (!user) return deny(401, '로그인이 필요합니다.');
  // 로그인은 됐지만 팀 도메인(@team-at.space)/대표가 아니면 차단 — 페이지·API 모두.
  if (!isAllowedEmail(user.email)) return deny(403, '팀 계정만 이용할 수 있습니다.');

  // 여기부터는 사용자별 섹션/가든탭 접근 권한 — 대표는 항상 전체
  if (isOwner(user.email)) return response;

  // API 도 섹션 권한을 따른다 — 페이지에서 숨긴 데이터를 API 직접 호출로 가져가지 못하게.
  // 매핑되지 않은 공용 API(log·notify·push·upload 등)는 팀 확인까지만 하고 통과.
  if (isApi) {
    const needed = sectionsForApiPath(path);
    if (!needed) return response;
    const { data: apiAccess } = await supabase
      .schema('finance')
      .from('garden_tab_access')
      .select('sections')
      .eq('user_id', user.id)
      .maybeSingle();
    const allowed = (apiAccess?.sections as string[] | null) ?? null; // 행 없음/null = 전체 허용
    if (allowed && !needed.some((k) => allowed.includes(k))) {
      return withCookies(NextResponse.json({ error: '접근 권한이 없는 섹션입니다.' }, { status: 403 }));
    }
    return response;
  }

  const section = sectionForPath(path);
  if (!section) return response;

  const { data: access } = await supabase
    .schema('finance')
    .from('garden_tab_access')
    .select('tabs, sections')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!access) return response; // 행 없음 = 전체 허용

  // 보낼 곳이 지금 경로와 같으면 무한 리다이렉트가 되므로, 그 경우엔 로그인 화면으로 돌린다.
  const goTo = (href: string | null | undefined) => {
    const url = request.nextUrl.clone();
    if (!href || href === path) {
      url.pathname = '/';
      url.search = 'denied=1';
    } else {
      url.pathname = href;
      url.search = '';
    }
    return withCookies(NextResponse.redirect(url));
  };

  const sections = (access.sections as string[] | null) ?? null;
  if (sections && !sections.includes(section)) return goTo(firstAllowedHref(sections));

  // 가든 하위 탭 권한 — 미허용 탭이면 허용된 첫 탭으로
  const tabs = (access.tabs as string[] | null) ?? null;
  if (section === 'garden' && tabs) {
    const current = tabForPath(path);
    if (current && !tabs.includes(current.key)) {
      const first = GARDEN_TABS.find((t) => tabs.includes(t.key));
      // 허용된 가든 탭이 하나도 없으면 가든 밖의 허용 섹션으로 — 없으면 로그인 화면.
      // (가든 안으로 되돌리면 같은 경로로 계속 튕겨 계정이 잠긴다)
      const outside = SECTIONS.find((s) => s.key !== 'garden' && (!sections || sections.includes(s.key)));
      return goTo(first?.href ?? outside?.href);
    }
  }

  return response;
}

export const config = {
  // 보호 페이지 + 모든 API. 정적 자산과 /, /s/*, /install, /garden-service/* 는 대상 아님.
  matcher: ['/dashboard/:path*', '/studio/:path*', '/garden/:path*', '/finance/:path*', '/api/:path*'],
};
