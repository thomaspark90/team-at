// 가든 하위 탭 정의 — 나비(GardenNav)와 설정의 탭 권한 관리가 공유한다.
// key 는 garden_tab_access.tabs 에 저장되는 값이므로 바꾸면 기존 권한 설정이 풀린다.

export type GardenTab = { key: string; href: string; label: string };

// 대시보드 | 필터(운영) | 리뷰·단어·설정 세 그룹
export const GARDEN_TAB_GROUPS: GardenTab[][] = [
  [{ key: 'dashboard', href: '/garden', label: '대시보드' }],
  [
    { key: 'pricing', href: '/garden/pricing', label: '필터 원두 발주' },
    { key: 'recipes', href: '/garden/recipes', label: '필터 레시피' },
    { key: 'recommended', href: '/garden/recommended', label: '필터 레시피 추천' },
    { key: 'calibration', href: '/garden/calibration', label: '분쇄도 측정' },
    { key: 'beancard', href: '/garden/beancard', label: '원두카드' },
  ],
  [
    { key: 'reviews', href: '/garden/reviews', label: '네이버 리뷰' },
    { key: 'words', href: '/garden/words', label: '제철 단어' },
    { key: 'settings', href: '/garden/settings', label: '설정' },
  ],
];

export const GARDEN_TABS: GardenTab[] = GARDEN_TAB_GROUPS.flat();
export const GARDEN_TAB_KEYS = GARDEN_TABS.map((t) => t.key);

/** 현재 경로가 어느 탭인지 판정 — 대시보드는 정확히, 나머지는 하위 경로 포함. */
export const tabForPath = (pathname: string): GardenTab | undefined =>
  GARDEN_TABS.find((t) =>
    t.href === '/garden' ? pathname === '/garden' : pathname === t.href || pathname.startsWith(t.href + '/'),
  );
