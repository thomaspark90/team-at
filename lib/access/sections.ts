// 앱 상위 섹션(= TabNav 탭) 정의 — 사용자별 접근 권한의 단위.
// key 는 finance.garden_tab_access.sections 에 저장되므로 바꾸면 기존 권한 설정이 풀린다.
// 가든 하위 탭 권한은 lib/garden/tabs.ts 가 담당하고, 여기는 상위 섹션만 다룬다.

export type AppSection = { key: string; href: string; label: string; desc: string };

export const SECTIONS: AppSection[] = [
  { key: 'studio', href: '/studio', label: 'Staff Meal', desc: '스탭밀 인스타 스토리 이미지 · 메뉴 관리' },
  { key: 'garden', href: '/garden', label: 'Garden Service', desc: '원두 발주 · 레시피 · 분쇄도 · 리뷰' },
  { key: 'accounting', href: '/dashboard', label: '회계', desc: '지출 분류 · 자료 업로드 · 월 결산' },
  { key: 'report', href: '/finance/dashboard', label: '리포트', desc: '손익 대시보드 · 지표 분석' },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);

// 회계 탭에 속하는 /finance 하위 경로(기장·결산) — 나머지 /finance 는 리포트(분석) 섹션.
// ⚠️ 회계 하위 내비(AccountingNav)에 화면을 추가하면 여기에도 등록할 것 — 빠지면
// 상단 탭이 '리포트'로 잘못 활성된다(로우데이터·전처리가 그랬음, 2026-08-21 대표 제보).
export const ACCOUNTING_FINANCE = [
  '/finance',
  '/finance/classify',
  '/finance/upload', // 자료 입력 — 회계의 주 진입 화면
  '/finance/uploads', // 업로드 이력
  '/finance/raw', // 로우데이터
  '/finance/prep', // 전처리1~4
  '/finance/originals', // 원본 자료함
  '/finance/close',
  '/finance/categories',
  '/finance/card',
];

export const inAccounting = (p: string) =>
  p.startsWith('/dashboard') ||
  ACCOUNTING_FINANCE.some((h) => p === h || (h !== '/finance' && p.startsWith(h + '/')));

/** 경로가 속한 섹션 key — 보호 대상이 아니면 null. */
export function sectionForPath(pathname: string): string | null {
  if (pathname === '/studio' || pathname.startsWith('/studio/')) return 'studio';
  if (pathname === '/garden' || pathname.startsWith('/garden/')) return 'garden';
  if (inAccounting(pathname)) return 'accounting';
  if (pathname === '/finance' || pathname.startsWith('/finance/')) return 'report';
  return null;
}

/** 허용 섹션 목록에서 첫 진입 경로 — 아무 것도 허용되지 않으면 null. */
export function firstAllowedHref(sections: string[] | null): string | null {
  if (sections === null) return SECTIONS[0].href;
  const found = SECTIONS.find((s) => sections.includes(s.key));
  return found?.href ?? null;
}

/** API 경로가 속한 섹션 후보 — 이 중 하나라도 허용이면 통과, 매핑 없으면 null(팀 확인까지만).
 *  페이지에서 숨긴 데이터를 API 직접 호출로 가져가는 걸 막는다(설정 화면의 안내 문구와 일치).
 *  여러 섹션이 공유하거나 자체 인증하는 경로(log·notify·push·upload·share·관리자 전용)는 매핑하지 않는다.
 *  finance API 는 회계(기장)와 리포트(분석) 화면이 함께 쓰므로 둘 중 하나만 있어도 허용. */
export function sectionsForApiPath(p: string): string[] | null {
  if (p.startsWith('/api/staffmeals') || p.startsWith('/api/backgrounds')) return ['studio'];
  if (p.startsWith('/api/staffmeal-todos')) return ['studio'];
  if (p.startsWith('/api/finance/')) return ['accounting', 'report'];
  // 작업 보드는 scope(garden|staffmeal)에 따라 필요한 섹션이 달라 라우트가 직접 확인한다.
  // 여기서 garden 으로 묶으면 스탭밀 전용 계정이 자기 보드도 못 연다.
  if (p.startsWith('/api/garden-board')) return null;
  if (p.startsWith('/api/garden-share') || p.startsWith('/api/garden-tab-access')) return null;
  // purchases 는 이름과 달리 가든의 '원두 발주' 기록이다 — 회계가 아니라 가든 화면들이 쓴다
  if (p.startsWith('/api/garden-') || p.startsWith('/api/purchases')) return ['garden'];
  // 발주 카톡 알림 — 발주 화면 전용. /api/kakao-notify/queue 는 PUBLIC_API 라 여기 안 온다
  if (p.startsWith('/api/kakao-notify')) return ['garden'];
  return null;
}

// 미들웨어 → 라우트 접근 스탬프 헤더. 미들웨어가 섹션 검사에서 이미 읽은
// garden_tab_access 행을 실어 보내, 라우트 가드(requireGardenTab)의 중복 DB 조회를 없앤다.
// 클라이언트가 보낸 값은 미들웨어가 모든 매칭 요청에서 제거하므로(위조 차단)
// 라우트에 도달한 스탬프는 미들웨어가 쓴 것만 존재한다.
export const TA_ACCESS_HEADER = 'x-ta-access';
