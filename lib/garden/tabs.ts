// 가든 하위 탭 정의 — 나비(GardenNav)와 설정의 탭 권한 관리가 공유한다.
// key 는 garden_tab_access.tabs 에 저장되는 값이므로 바꾸면 기존 권한 설정이 풀린다.

export type GardenTab = { key: string; href: string; label: string; desc?: string };

// 대시보드 | 필터(운영) | 리뷰·단어·설정 세 그룹
export const GARDEN_TAB_GROUPS: GardenTab[][] = [
  [{ key: 'dashboard', href: '/garden', label: '홈', desc: '가든 홈 — 내 차례인 일 · 재고·레시피 미설정 원두 한눈에 보기' }],
  [
    // 2026-11-24 발주 화면을 원두 장부(recipes)로 합쳤다 — 이 키는 '[원두 발주] 입력·발주 기록 삭제' 권한으로 남는다.
    // /garden/pricing 은 장부로 넘긴다(장부 권한이 없는 계정에만 예전 입력 화면을 보여준다).
    { key: 'pricing', href: '/garden/pricing', label: '필터 원두 발주', desc: '원두 장부의 [원두 발주] — 원두 정보·매입가 입력 · 발주 기록 삭제' },
    // 발주(pricing)와 판매가 책정을 분리 — 책정 권한만 다른 인원에게 줄 수 있다
    // 2026-11-24 판매가 설정 화면도 장부로 합쳤다 — 이 키는 '장부 줄 펼침의 판매가 책정·변경·공유' 권한으로 남는다.
    { key: 'saleprice', href: '/garden/saleprice', label: '판매가 설정', desc: '원두 장부 줄 펼침의 [판매가] — 드립 판매가 책정 · 변경 · 공유' },
    { key: 'recipes', href: '/garden/filtercoffee', label: '필터커피', desc: '원두 장부 — 발주 기록 · 판매가 · ICE/HOT 레시피 편집' },
    { key: 'recommended', href: '/garden/recommended', label: '필터 레시피 추천', desc: '원두별 추천 레시피 조회' },
    { key: 'calibration', href: '/garden/calibration', label: '분쇄도 측정', desc: 'EK43 캘리브레이션 업로드 · 차트' },
    { key: 'beancard', href: '/garden/beancard', label: '원두카드', desc: '매장 비치용 원두카드 인쇄' },
    { key: 'theory', href: '/garden/theory', label: '커피 추출 이론', desc: '스탭 교육 · 현장 참고용 추출 이론' },
    { key: 'beanguide', href: '/garden/bean-guide', label: '원두에 대한 이해', desc: '원산지 떼루아 · 유명 농장 · 이름 읽는 법 · 품종 · 고도와 품질 요소' },
    // 반복 발주 품목표(2026-11-26) — 대표·매니저 전용. 원두 발주(pricing)와 다른 화면이다.
    { key: 'reorder', href: '/garden/reorder', label: '발주', desc: '자주 사는 재료 품목표 · 지난 구매가 · 판매처 승인 (대표·매니저, 원두 발주와 별개)' },
    { key: 'sales', href: '/garden/sales', label: '상품 추이', desc: '지점별 POS 매출 요약 (재무 멤버)' },
    { key: 'weather', href: '/garden/weather', label: '날씨 분석', desc: '기온·강수 밴드별 판매 효과 리포트' },
  ],
  [
    // 매니저 교육 — 스탭 위시리스트·매니저 출근 일정·교육 기록. 간편 계정 발급 시 기본 허용 탭(2026-09-07)
    // 근무 스케줄 — 운영진 작성·배포, 직원은 배포된 계획 열람(2026-11-06)
    { key: 'schedule', href: '/garden/schedule', label: '스케줄', desc: '주간 근무 계획 · 실제 근무 · 연차' },
    // 하위 경로라 체크리스트보다 먼저 둔다(tabForPath 는 앞에서부터 찾는다). 끄면 항목을 못 바꾼다.
    { key: 'checklist_items', href: '/garden/checklist/items', label: '체크리스트 항목 관리', desc: '항목 추가 · 삭제 · 순서 · 사진 필수 (체크리스트 탭과 함께 켜기)' },
    { key: 'checklist', href: '/garden/checklist', label: '체크리스트', desc: '오픈 · 마감 담당 체크' },
    // 브런치 네임택(2026-11-20) — 하위 경로라 관리 탭을 먼저 둔다(tabForPath 는 앞에서부터 찾는다).
    { key: 'nametags_manage', href: '/garden/nametags/manage', label: '네임택 인쇄·메뉴 관리', desc: '요청분 일러스트 인쇄 파일 받기 · 메뉴 추가·수정 (그래픽 담당)' },
    { key: 'nametags', href: '/garden/nametags', label: '브런치 네임택', desc: '필요한 메뉴만 골라 프린트 요청' },
    { key: 'teaching', href: '/garden/teaching', label: '교육', desc: '배우고 싶은 주제 · 매니저 출근 일정 · 교육 기록' },
    { key: 'reviews', href: '/garden/reviews', label: '네이버 리뷰', desc: '리뷰 확인 · 답글 초안 작성' },
    { key: 'words', href: '/garden/words', label: '제철 단어', desc: '고객 제출 단어 검수' },
    { key: 'settings', href: '/garden/settings', label: '설정', desc: '드롭다운 명단 · 알림 · 요청 보내기' },
  ],
];

export const GARDEN_TABS: GardenTab[] = GARDEN_TAB_GROUPS.flat();

// 간편 계정(스탭·매니저)을 만들 때 부여하는 기본 탭. 넓히려면 설정 › 페이지 접근 권한.
// 작업 보드(dashboard)는 2026-11-19 추가 — 로그인 첫 화면이 작업 보드이고, 스탭이 거기서 [원두 수령]을 누른다.
export const SIMPLE_ACCOUNT_TABS = ['dashboard', 'teaching', 'theory', 'beanguide', 'checklist'];

// 내비 한 줄 구성(2026-09-09 대표 결정: 탭 14개 → 작업 보드 + 묶음 3 + 교육 + 설정).
// 묶음은 화면 표시 전용 — 권한 키·경로는 위 GARDEN_TAB_GROUPS 그대로. 항목은 key 로 참조한다.
// hidden — 메뉴에는 안 보이지만 이 묶음에 속하는 탭. 설정의 권한 표·항목별 담당자 묶음이 같은 자리에 놓도록(2026-11-24 발주 → 장부 통합).
export type GardenNavEntry = { label: string; keys: string[]; hidden?: string[] };
export const GARDEN_NAV: GardenNavEntry[] = [
  { label: '홈', keys: ['dashboard'] }, // 2026-11-20 대표 결정: '작업 보드' → '홈'(화면 제목은 가든서비스 로고 + 홈)
  // 2026-11-24 대표 결정: 발주 + 레시피 = 원두 장부 한 화면. 매일 쓰는 화면이라 묶음 없이 바로 연다. 발주(pricing)는 장부 안 버튼이라 메뉴에서 뺐다.
  // 같은 날 '커피(필터) ▾' 묶음을 없앴다 — 작업 도구(분쇄도 측정·원두카드)는 필터커피 화면의 링크로, 읽는 자료(추출 이론·원두 이해·추천 레시피)는 교육의 탭으로.
  { label: '필터커피', keys: ['recipes'], hidden: ['pricing', 'saleprice', 'calibration', 'beancard'] },
  { label: '발주', keys: ['reorder'] }, // 재료 반복 발주(2026-11-26). 원두 발주는 필터커피 화면 안에 있다
  { label: '분석', keys: ['sales', 'weather', 'reviews'] },
  { label: '스케줄', keys: ['schedule'] },
  { label: '체크리스트', keys: ['checklist'] }, // 항목 관리는 체크리스트 화면에서 들어간다 — 직원이 매일 쓰는 메뉴를 한 번에 열리게
  { label: '네임택', keys: ['nametags'] }, // 인쇄·메뉴 관리는 네임택 화면에서 들어간다(체크리스트 항목 관리와 같은 방식)
  { label: '교육', keys: ['teaching'], hidden: ['theory', 'beanguide', 'recommended'] }, // 읽는 자료는 화면 위 탭(EducationTabs)으로 오간다
  { label: '설정', keys: ['settings'] },
];
export const GARDEN_TAB_KEYS = GARDEN_TABS.map((t) => t.key);

/** 현재 경로가 어느 탭인지 판정 — 대시보드는 정확히, 나머지는 하위 경로 포함. */
// 제철 단어 검수(승인·반려) 시 쏘는 브라우저 이벤트 — GardenNav가 듣고 배지를 갱신한다
export const WORDS_CHANGED_EVENT = 'garden-words-changed';

export const tabForPath = (pathname: string): GardenTab | undefined =>
  GARDEN_TABS.find((t) =>
    t.href === '/garden' ? pathname === '/garden' : pathname === t.href || pathname.startsWith(t.href + '/'),
  );
