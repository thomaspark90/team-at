// 가든 작업 보드 — 앱에 흩어져 있는 일들을 한 보드의 카드로 모은다.
// 새 데이터를 만들지 않고 기존 상태값(발주·레시피·측정·리뷰·송금·투두)을 읽어 카드를 세우므로,
// 각자 자기 화면에서 일을 처리하면 보드가 자동으로 따라온다.

export type BoardColumn = 'todo' | 'doing' | 'done';

/** 보드는 브랜드별로 나뉜다 — 가든 화면엔 가든 일만, 스탭밀 화면엔 스탭밀 일만 */
export type BoardScope = 'garden' | 'staffmeal';

export type BoardType = 'order' | 'measure' | 'align' | 'review' | 'money' | 'todo' | 'meal' | 'upload';

export const BOARD_TYPES: { id: BoardType; label: string; color: string }[] = [
  { id: 'order', label: '발주', color: 'var(--chart-cat-1)' },
  { id: 'measure', label: '측정', color: 'var(--chart-cat-2)' },
  { id: 'align', label: '얼라인', color: 'var(--chart-cat-8)' },
  { id: 'review', label: '리뷰', color: 'var(--chart-cat-7)' },
  { id: 'meal', label: '스탭밀', color: 'var(--chart-cat-4)' },
  { id: 'money', label: '송금', color: 'var(--chart-cat-3)' },
  { id: 'upload', label: '자료', color: 'var(--chart-cat-5)' },
  { id: 'todo', label: '투두', color: 'var(--chart-cat-other)' },
];

export const BOARD_COLUMNS: { id: BoardColumn; label: string }[] = [
  { id: 'todo', label: '할 일' },
  { id: 'doing', label: '진행 중' },
  { id: 'done', label: '완료' },
];

export interface BoardStep {
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

export interface BoardMeta {
  text: string;
  tone?: 'late' | 'ok';
}

export interface BoardCard {
  id: string;
  type: BoardType;
  title: string;
  column: BoardColumn;
  steps: BoardStep[];
  meta: BoardMeta[];
  /** 이 단계를 맡은 사람들(이메일). 비어 있으면 '누구나' */
  assignees: string[];
  /** 요청한 사람의 차례인지 */
  mine: boolean;
  /** 왜 내 차례인지 — '캘리브레이션 담당' 등 */
  mineReason?: string;
  href: string;
  actionLabel: string;
  /** 0~1 — 있으면 진행률 바 표시 */
  progress?: number;
  /** 이 카드를 열려면 필요한 가든 탭 (권한 필터용). null = 탭 체계 밖(섹션 권한만 본다) */
  tab: string | null;
  /** 정렬용 — 오래된 일이 위로 */
  sortAt: string;
}

/** 카드 유형 → 필요한 가든 탭. 권한이 없는 탭의 카드는 서버에서 걸러낸다.
 *  스탭밀 보드(meal)는 가든 탭 체계 밖이라 섹션(studio) 권한으로만 판단한다. */
export const TYPE_TAB: Record<BoardType, string | null> = {
  order: 'pricing',
  measure: 'calibration',
  align: 'calibration',
  review: 'reviews',
  money: 'dashboard', // 송금은 회계 화면이지만 카드 자체는 대시보드에 뜬다
  upload: 'dashboard', // 월 자료 마감 리마인더 — 송금과 같은 기준
  todo: 'settings',
  meal: null,
};

export const step = (label: string, state: BoardStep['state']): BoardStep => ({ label, state });

/** 흐름 정의에서 현재 단계 index 로 스텝 배열을 만든다 */
export const stepsAt = (labels: string[], current: number): BoardStep[] =>
  labels.map((l, i) => step(l, i < current ? 'done' : i === current ? 'current' : 'upcoming'));

const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000);
export const kstDay = (iso: string) => kst(iso).toISOString().slice(0, 10);

/** 며칠 지났는지 (KST 날짜 기준) */
export const daysAgo = (iso: string): number => {
  const a = new Date(kstDay(iso)).getTime();
  const b = new Date(kstDay(new Date().toISOString())).getTime();
  return Math.round((b - a) / 86_400_000);
};

export const shortDate = (iso: string) => kstDay(iso).slice(5).replace('-', '.');
