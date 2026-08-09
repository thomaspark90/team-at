// 가든 하위 탭 정의 — 나비(GardenNav)와 설정의 탭 권한 관리가 공유한다.
// key 는 garden_tab_access.tabs 에 저장되는 값이므로 바꾸면 기존 권한 설정이 풀린다.

export type GardenTab = { key: string; href: string; label: string; desc?: string };

// 대시보드 | 필터(운영) | 리뷰·단어·설정 세 그룹
export const GARDEN_TAB_GROUPS: GardenTab[][] = [
  [{ key: 'dashboard', href: '/garden', label: '대시보드', desc: '재고·레시피 미설정 원두 한눈에 보기' }],
  [
    { key: 'pricing', href: '/garden/pricing', label: '필터 원두 발주', desc: '원두 정보·매입가 입력 · 발주 기록' },
    // 발주(pricing)와 판매가 책정을 분리 — 책정 권한만 다른 인원에게 줄 수 있다
    { key: 'saleprice', href: '/garden/saleprice', label: '판매가 설정', desc: '발주 원두 드립 판매가 책정 · 공유' },
    { key: 'recipes', href: '/garden/recipes', label: '필터 레시피', desc: 'ICE/HOT 레시피 편집 · 추출 타이머' },
    { key: 'recommended', href: '/garden/recommended', label: '필터 레시피 추천', desc: '원두별 추천 레시피 조회' },
    { key: 'calibration', href: '/garden/calibration', label: '분쇄도 측정', desc: 'EK43 캘리브레이션 업로드 · 차트' },
    { key: 'beancard', href: '/garden/beancard', label: '원두카드', desc: '매장 비치용 원두카드 인쇄' },
    { key: 'sales', href: '/garden/sales', label: '매출', desc: '지점별 POS 매출 요약 (재무 멤버)' },
    { key: 'weather', href: '/garden/weather', label: '날씨 분석', desc: '기온·강수 밴드별 판매 효과 리포트' },
  ],
  [
    { key: 'reviews', href: '/garden/reviews', label: '네이버 리뷰', desc: '리뷰 확인 · 답글 초안 작성' },
    { key: 'words', href: '/garden/words', label: '제철 단어', desc: '고객 제출 단어 검수' },
    { key: 'settings', href: '/garden/settings', label: '설정', desc: '드롭다운 명단 · 알림 · 요청 보내기' },
  ],
];

export const GARDEN_TABS: GardenTab[] = GARDEN_TAB_GROUPS.flat();
export const GARDEN_TAB_KEYS = GARDEN_TABS.map((t) => t.key);

/** 현재 경로가 어느 탭인지 판정 — 대시보드는 정확히, 나머지는 하위 경로 포함. */
// 제철 단어 검수(승인·반려) 시 쏘는 브라우저 이벤트 — GardenNav가 듣고 배지를 갱신한다
export const WORDS_CHANGED_EVENT = 'garden-words-changed';

export const tabForPath = (pathname: string): GardenTab | undefined =>
  GARDEN_TABS.find((t) =>
    t.href === '/garden' ? pathname === '/garden' : pathname === t.href || pathname.startsWith(t.href + '/'),
  );
