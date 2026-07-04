// Monarch 스타일 Cash Flow Sankey 데이터 셰이핑.
// 왼쪽: 매출 항목 → 중앙: 총 매출 → 오른쪽: 지출 그룹(재료비/판관비/영업외/손익제외) → 세부 항목.
// 좌/우는 각각 자기 합계(총매출/총지출) 기준 100% 로 분배한다(금액이 서로 달라도 됨).

export interface SankTx {
  ym: string;
  category_id: number | null;
  amount_in: number;
  amount_out: number;
}
export interface SankCat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
}

export interface SankLeaf {
  name: string;
  amount: number;
}
export interface SankGroup {
  key: string;
  label: string;
  color: string;
  amount: number;
  leaves: SankLeaf[];
}
export interface SankeyData {
  revenue: SankLeaf[];
  totalRevenue: number;
  groups: SankGroup[];
  totalExpense: number;
}

export const REVENUE_COLOR = '#009e35'; // number-colored 초록과 통일 (매출=초록)

// 지출 그룹(대분류=type) 정의·색·순서. 검증된 categorical 팔레트.
export const EXPENSE_GROUPS: { key: string; label: string; color: string }[] = [
  { key: 'cogs', label: '재료비', color: '#E8833A' },
  { key: 'sga', label: '판매관리비', color: '#3B82C4' },
  { key: 'non_operating', label: '영업외', color: '#8B5C9E' },
  { key: 'excluded', label: '손익 제외', color: '#C2557A' },
];

// 세부 항목이 총지출의 이 비율 미만이면 그룹 내 '기타'로 묶는다(라벨 가독성).
const MIN_LEAF_RATIO = 0.015;

export function buildSankey(txns: SankTx[], cats: SankCat[]): SankeyData {
  const byId = new Map(cats.map((c) => [c.id, c]));
  // 소분류는 상위 대분류 이름으로 롤업(정규직→인건비, 전기→수도광열비 …)
  const leafName = (c: SankCat): string => {
    if (c.parent_id != null) {
      const p = byId.get(c.parent_id);
      if (p) return p.name;
    }
    return c.name;
  };

  const revMap = new Map<string, number>();
  const grpLeaf = new Map<string, Map<string, number>>();
  for (const g of EXPENSE_GROUPS) grpLeaf.set(g.key, new Map());

  for (const t of txns) {
    if (t.category_id == null) continue;
    const c = byId.get(t.category_id);
    if (!c) continue;
    if (c.type === 'revenue') {
      if (t.amount_in > 0) revMap.set(leafName(c), (revMap.get(leafName(c)) ?? 0) + t.amount_in);
    } else {
      // 지출: 출금액만 흐름으로 본다(영업외 이자수익 등 유입은 제외)
      const m = grpLeaf.get(c.type);
      if (m && t.amount_out > 0) m.set(leafName(c), (m.get(leafName(c)) ?? 0) + t.amount_out);
    }
  }

  const revenue = Array.from(revMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);

  // 그룹별 세부 항목 정리 + '기타' 롤업
  const rawGroups = EXPENSE_GROUPS.map((g) => {
    const entries = Array.from((grpLeaf.get(g.key) ?? new Map<string, number>()).entries())
      .map(([name, amount]) => ({ name, amount: amount as number }))
      .filter((l) => l.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const amount = entries.reduce((s, l) => s + l.amount, 0);
    return { ...g, amount, entries };
  }).filter((g) => g.amount > 0);

  const totalExpense = rawGroups.reduce((s, g) => s + g.amount, 0);
  const threshold = totalExpense * MIN_LEAF_RATIO;

  const groups: SankGroup[] = rawGroups.map((g) => {
    const big = g.entries.filter((l) => l.amount >= threshold);
    const small = g.entries.filter((l) => l.amount < threshold);
    const leaves = [...big];
    const rest = small.reduce((s, l) => s + l.amount, 0);
    if (rest > 0) leaves.push({ name: '기타', amount: rest });
    return { key: g.key, label: g.label, color: g.color, amount: g.amount, leaves };
  });

  return { revenue, totalRevenue, groups, totalExpense };
}
