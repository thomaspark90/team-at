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
export const ACCOUNTING_FINANCE = [
  '/finance',
  '/finance/classify',
  '/finance/upload', // 자료 입력 — 회계의 주 진입 화면
  '/finance/uploads', // 업로드 이력
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
