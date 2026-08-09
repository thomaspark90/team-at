// 스탭밀 하위 탭 정의 — StudioNav 와 설정의 탭 권한 관리가 공유한다.
// key 는 garden_tab_access.studio_tabs 에 저장되는 값이므로 바꾸면 기존 권한 설정이 풀린다.

export type StudioTab = { key: string; href: string; label: string; desc?: string };

export const STUDIO_TABS: StudioTab[] = [
  { key: 'dashboard', href: '/studio', label: '작업 보드', desc: '스탭밀 작업 보드 — 메뉴 스토리·송금 요청' },
  { key: 'menu', href: '/studio/menu', label: 'IG 메뉴 업데이트', desc: '인스타 스토리 이미지 생성' },
  { key: 'meals', href: '/studio/meals', label: '메뉴 기록', desc: '스탭밀 메뉴 기록 아카이브' },
  { key: 'sales', href: '/studio/sales', label: '매출', desc: '지점별 POS 매출 요약 (재무 멤버)' },
  { key: 'settings', href: '/studio/settings', label: '설정', desc: '알림 담당자 · 팀 투두리스트' },
];

export const STUDIO_TAB_KEYS = STUDIO_TABS.map((t) => t.key);

/** 현재 경로가 어느 스탭밀 탭인지 판정 — 대시보드는 정확히, 나머지는 하위 경로 포함. */
export const tabForPath = (pathname: string): StudioTab | undefined =>
  STUDIO_TABS.find((t) =>
    t.href === '/studio' ? pathname === '/studio' : pathname === t.href || pathname.startsWith(t.href + '/'),
  );
