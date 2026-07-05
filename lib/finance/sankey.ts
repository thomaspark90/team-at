// Monarch 스타일 Cash Flow Sankey 데이터 셰이핑.
// 왼쪽: 유입 항목(매출 + 기타/미분류 수입) → 중앙: 총 유입 →
// 오른쪽: 유출 그룹(재료비/판관비/영업외/손익제외/미분류) → 세부 항목 (+ 남은 영업이익).
// 통장 현황과 숫자가 맞도록 분류·미분류 관계없이 모든 입금/출금을 반영한다
// (총유입 − 총유출 = 순증감 = 통장 현황 순증감).

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
  children?: SankLeaf[]; // 소분류(있으면 5번째 열로 펼침) — 예: 인건비 → 정규직/단기/일일용역
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

export const UNCLASSIFIED_COLOR = '#9AA3AD'; // 미분류(중립 회색)

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
  // type → 중분류(대분류명) → 소분류(실제 계정명) → 금액
  const grpLeaf = new Map<string, Map<string, Map<string, number>>>();
  for (const g of EXPENSE_GROUPS) grpLeaf.set(g.key, new Map());
  let otherIncome = 0; // 분류됐지만 매출이 아닌 유입(영업외수익·손익제외 유입 등)
  let unclassifiedIn = 0; // 미분류 유입
  let unclassifiedOut = 0; // 미분류 유출(+ 그룹에 안 맞는 분류 유출도 여기로)

  for (const t of txns) {
    const c = t.category_id == null ? undefined : byId.get(t.category_id);
    // 입금 → 왼쪽(유입)
    if (t.amount_in > 0) {
      if (c && c.type === 'revenue') revMap.set(leafName(c), (revMap.get(leafName(c)) ?? 0) + t.amount_in);
      else if (c) otherIncome += t.amount_in;
      else unclassifiedIn += t.amount_in;
    }
    // 출금 → 오른쪽(유출). 중분류(대분류명)와 소분류(자기 이름) 둘 다 집계.
    // 단, 정산/분해 표식('카드대금정산'=은행 카드결제 lump, '영수증분해'=쿠팡 원본)은
    // 손익에서 제외 — 각각 카드 사용내역·영수증 품목이 대체하므로 중복 방지.
    if (t.amount_out > 0 && !(c && (c.name === '카드대금정산' || c.name === '영수증분해'))) {
      const m = c ? grpLeaf.get(c.type) : undefined;
      if (m) {
        const mid = leafName(c!); // 인건비
        const detail = c!.name; // 정규직 (또는 대분류 직접분류 시 인건비)
        let dm = m.get(mid);
        if (!dm) {
          dm = new Map();
          m.set(mid, dm);
        }
        dm.set(detail, (dm.get(detail) ?? 0) + t.amount_out);
      } else unclassifiedOut += t.amount_out; // 미분류 or 매출계정 환불 등 그룹 없는 유출
    }
  }

  // 왼쪽: 유입(매출 + 기타 수입 + 미분류 수입). 총유입 = 모든 입금 합.
  const revenue = Array.from(revMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (otherIncome > 0) revenue.push({ name: '기타 수입', amount: otherIncome });
  if (unclassifiedIn > 0) revenue.push({ name: '미분류 수입', amount: unclassifiedIn });
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);

  // 오른쪽: 지출 그룹 → 중분류(대분류명) → 소분류(children)
  const rawGroups = EXPENSE_GROUPS.map((g) => {
    const midMap = grpLeaf.get(g.key) ?? new Map<string, Map<string, number>>();
    const mids = Array.from(midMap.entries())
      .map(([midName, dm]) => {
        const details = Array.from(dm.entries())
          .map(([name, amount]) => ({ name, amount: amount as number }))
          .filter((dd) => dd.amount > 0)
          .sort((a, b) => b.amount - a.amount);
        return { name: midName, amount: details.reduce((s, dd) => s + dd.amount, 0), details };
      })
      .filter((m) => m.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const amount = mids.reduce((s, m) => s + m.amount, 0);
    return { ...g, amount, mids };
  }).filter((g) => g.amount > 0);

  // 총유출 = 분류된 유출 + 미분류 유출 (통장 현황의 총출금과 일치)
  const totalExpense = rawGroups.reduce((s, g) => s + g.amount, 0) + unclassifiedOut;
  const threshold = totalExpense * MIN_LEAF_RATIO;

  const groups: SankGroup[] = rawGroups.map((g) => {
    const bigMids = g.mids.filter((m) => m.amount >= threshold);
    const smallMids = g.mids.filter((m) => m.amount < threshold);
    const leaves: SankLeaf[] = bigMids.map((m) => {
      // 소분류가 의미 있으면(2개 이상 또는 자기 이름과 다르면) 5번째 열로 펼친다
      const expand = m.details.length > 1 || (m.details.length === 1 && m.details[0].name !== m.name);
      let children: SankLeaf[] | undefined;
      if (expand) {
        const dth = m.amount * 0.05; // 중분류 대비 5% 미만 소분류는 '기타'로 묶음
        const bigD = m.details.filter((dd) => dd.amount >= dth);
        const restD = m.details.filter((dd) => dd.amount < dth).reduce((s, dd) => s + dd.amount, 0);
        children = bigD.map((dd) => ({ name: dd.name, amount: dd.amount }));
        if (restD > 0) children.push({ name: '기타', amount: restD });
      }
      return { name: m.name, amount: m.amount, children };
    });
    const restMid = smallMids.reduce((s, m) => s + m.amount, 0);
    if (restMid > 0) leaves.push({ name: '기타', amount: restMid });
    return { key: g.key, label: g.label, color: g.color, amount: g.amount, leaves };
  });
  if (unclassifiedOut > 0) {
    groups.push({
      key: 'unclassified',
      label: '미분류',
      color: UNCLASSIFIED_COLOR,
      amount: unclassifiedOut,
      leaves: [{ name: '미분류', amount: unclassifiedOut }],
    });
  }

  return { revenue, totalRevenue, groups, totalExpense };
}
