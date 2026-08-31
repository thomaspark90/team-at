// 고정비/변동비 구분(cost_nature) — 계정과목 속성을 지표·BEP가 읽는 한 곳 (2026-08-31).
//
// 값은 finance.categories.cost_nature('fixed' | 'variable' | null). 어느 계정이 고정인지는 운영 판단이라
// 코드 상수가 아니라 계정과목 화면에서 토글한다(마이그레이션 20260831102034_cost_nature 에 초기값·근거).
//
// 규칙:
//   · 자기 값이 있으면 그 값 · null 이면 상위 계정 값을 상속 · 최상위까지 null 이면 null(=미확정)
//   · 재료비(cogs)·판관비(sga)만 대상 — 매출·영업외·손익제외는 항상 null
//   · '미확정'은 미분류·미상·카드 미분해와 같이 고정/변동 어느 쪽에도 섞지 않고 따로 보여준다

export type CostNature = 'fixed' | 'variable';

export interface CostNatureCat {
  id: number;
  type: string;
  parent_id: number | null;
  cost_nature?: CostNature | null;
}

export const COST_NATURE_LABEL: Record<CostNature, string> = { fixed: '고정비', variable: '변동비' };
export const COST_UNDETERMINED_LABEL = '미확정';

const NATURE_TYPES = new Set(['cogs', 'sga']);

/** 계정의 고정/변동 — 자기 값 → 상위 상속 → null(미확정). catMap 은 id → 계정. */
export function resolveCostNature<C extends CostNatureCat>(c: C, catMap: Map<number, C>): CostNature | null {
  if (!NATURE_TYPES.has(c.type)) return null;
  let cur: C | undefined = c;
  let hops = 0;
  while (cur && hops < 8) {
    if (cur.cost_nature === 'fixed' || cur.cost_nature === 'variable') return cur.cost_nature;
    cur = cur.parent_id != null ? catMap.get(cur.parent_id) : undefined;
    hops += 1;
  }
  return null;
}

/** 계정과목 화면용 — 자기 값인지 상속인지 구분해 돌려준다. */
export function describeCostNature<C extends CostNatureCat>(
  c: C,
  catMap: Map<number, C>,
): { nature: CostNature | null; inherited: boolean } {
  if (c.cost_nature === 'fixed' || c.cost_nature === 'variable') return { nature: c.cost_nature, inherited: false };
  const nature = resolveCostNature(c, catMap);
  return { nature, inherited: nature != null };
}

/** 토글 순서: 미지정 → 고정 → 변동 → 미지정 */
export function nextCostNature(cur: CostNature | null | undefined): CostNature | null {
  if (cur == null) return 'fixed';
  if (cur === 'fixed') return 'variable';
  return null;
}

// 지표 '고정비·변동비' 차트 아래 노트 — 대표 결정(2026-08-31)으로 고정비에 넣었지만 매출 따라 일부 움직이는
// 항목을 명시한다. 분류를 바꾸면 계정과목 화면에서 토글하고, 이 문구도 함께 고친다.
export const COST_NATURE_NOTES: string[] = [
  '단기·일일용역 인건비는 고정비로 분류했어요 — 바쁜 달엔 매출 따라 일부 늘어날 수 있어요(2026-08-31 결정).',
  '수도광열비(전기·가스·수도)는 고정비로 분류했어요 — 여름 전기요금처럼 계절·매출 연동분이 섞여 있어요(2026-08-31 결정).',
  '미분류·미상·카드 미분해는 성격을 몰라 "미확정"으로 따로 뒀어요(고정·변동 어느 쪽에도 안 섞음). 구분은 설정 › 계정과목에서 고정/변동 토글로 바꿔요.',
];
