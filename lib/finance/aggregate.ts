// 월/주 단위 손익 집계 (EBIT 기준). 미분류·손익제외는 제외.
// 매출 = POS 공급가액(발생주의). 통장 매출 입금이 아니라 POS 판매 시점 기준.
// 지출(재료비·판관비)은 거래분류(통장·카드)에서, 과세분은 공급가액(÷1.1)으로 순액화해 매출과 기준 통일.
export const VAT_DIVISOR = 1.1;

// 미분류 지출을 지출 구분/손익에 노출할 때 쓰는 라벨
export const UNCLASSIFIED = '미분류';

export interface AggCat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
  vat_taxable?: boolean; // 과세 매입/매출이면 순액(÷1.1) 대상. 없으면 과세로 간주(안전 기본값)
}
export interface AggTx {
  tx_at: string; // ISO
  amount_in: number;
  amount_out: number;
  category_id: number | null;
  brand?: string | null; // 'garden' | 'staffmeal' — 대시보드 브랜드 필터용(집계 자체는 사용 안 함)
  store?: string | null; // 'pangyo' | 'yangjae' — 가든 지점 필터용(집계 자체는 사용 안 함)
}
export type Unit = 'month' | 'week';

export interface MonthAgg {
  ym: string; // period key (월: YYYY-MM, 주: 그 주 월요일 YYYY-MM-DD)
  revenue: number;
  unclassifiedIn: number; // 미분류 입금(대출·자본유입 등 비매출 가능) — 매출과 분리해 별도 표기
  cogs: number;
  sga: number;
  ebit: number;
  nonOp: number;
  net: number;
  costRatio: number | null;
  profitRatio: number | null;
  expense: Record<string, number>;
}

function periodKey(iso: string, unit: Unit): string {
  if (unit === 'month') return iso.slice(0, 7);
  // 주: 그 주의 월요일 날짜
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // 월=0 … 일=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function aggregate(
  txns: AggTx[],
  cats: AggCat[],
  unit: Unit = 'month',
  netVat = true,
  posSales: { saleDate: string; supply: number }[] = [],
): { months: MonthAgg[]; expenseKeys: string[] } {
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const nameOf = (c: AggCat): string => {
    if (c.parent_id != null) {
      const p = catMap.get(c.parent_id);
      return p ? p.name : c.name;
    }
    return c.name;
  };

  const m = new Map<string, MonthAgg>();
  const expenseKeys = new Set<string>();

  // 순액 모드에서 과세 항목만 공급가액(총액÷1.1)으로. VAT는 손익 아닌 예수/대급금이라 제외.
  // 면세·비대상(인건비·이자·수도·세금 등)은 그대로. vat_taxable 미지정은 과세로 간주.
  const netAmt = (v: number, c: AggCat) => (netVat && c.vat_taxable !== false ? Math.round(v / VAT_DIVISOR) : v);
  const getMo = (key: string): MonthAgg => {
    let mo = m.get(key);
    if (!mo) {
      mo = { ym: key, revenue: 0, unclassifiedIn: 0, cogs: 0, sga: 0, ebit: 0, nonOp: 0, net: 0, costRatio: null, profitRatio: null, expense: {} };
      m.set(key, mo);
    }
    return mo;
  };

  for (const t of txns) {
    const mo = getMo(periodKey(t.tx_at, unit));
    const c = t.category_id != null ? catMap.get(t.category_id) : undefined;

    if (!c) {
      // 미분류(또는 삭제된 계정): 지출은 '미분류' 비용으로 EBIT 차감(유지). 단 입금은 대출·자본유입 등
      // 비매출일 수 있어 매출에 넣지 않고 별도(unclassifiedIn)로 분리 — 분류하면 정확한 계정으로 이동.
      // 과세여부를 모르므로 순액화 안 함(총액 그대로).
      mo.unclassifiedIn += t.amount_in;
      if (t.amount_out) {
        mo.sga += t.amount_out;
        mo.expense[UNCLASSIFIED] = (mo.expense[UNCLASSIFIED] || 0) + t.amount_out;
        expenseKeys.add(UNCLASSIFIED);
      }
      continue;
    }

    // 매출은 POS(발생주의)에서 잡으므로 은행 매출 입금(revenue)은 손익 집계에 넣지 않음.
    // 비용 계정의 입금은 매입 환불(환입) — 잡손익이 아니라 해당 비용에서 차감해야
    // 재료비율·EBIT 구성이 정확하다(2026-08-17 미트박스 환불 건).
    if (c.type === 'cogs') {
      const amt = netAmt(t.amount_out, c) - netAmt(t.amount_in, c);
      mo.cogs += amt;
      const k = nameOf(c);
      mo.expense[k] = (mo.expense[k] || 0) + amt;
      expenseKeys.add(k);
    } else if (c.type === 'sga') {
      const amt = netAmt(t.amount_out, c) - netAmt(t.amount_in, c);
      mo.sga += amt;
      const k = nameOf(c);
      mo.expense[k] = (mo.expense[k] || 0) + amt;
      expenseKeys.add(k);
    } else if (c.type === 'non_operating') {
      mo.nonOp += netAmt(t.amount_in, c) - netAmt(t.amount_out, c);
    }
  }

  // 매출 = POS 공급가액(발생주의). 통장 입금 대신 판매 시점(sale_date) 기준으로 기간 귀속.
  for (const p of posSales) {
    getMo(periodKey(p.saleDate, unit)).revenue += p.supply;
  }

  const months = Array.from(m.values()).sort((a, b) => a.ym.localeCompare(b.ym));
  for (const mo of months) {
    mo.ebit = mo.revenue - mo.cogs - mo.sga;
    mo.net = mo.ebit + mo.nonOp;
    mo.costRatio = mo.revenue > 0 ? mo.cogs / mo.revenue : null;
    mo.profitRatio = mo.revenue > 0 ? mo.ebit / mo.revenue : null;
  }
  return { months, expenseKeys: Array.from(expenseKeys) };
}

// 감가상각(정액법): 자본적지출(인테리어·설비·초기투자)을 usefulMonths(기본 60=5년)로 나눠
// 지출한 달부터 매달 균등 배분한다. ym → 월 감가상각액 맵을 반환.
// 관리손익/EBIT엔 자본적지출이 통째로 빠져 있어 영업이익이 과대 → 이 상각액을 빼면 '실질'에 가까움.
export function capexDepreciation(txns: AggTx[], cats: AggCat[], usefulMonths = 60): Record<string, number> {
  const capexRoot = cats.find((c) => c.type === 'excluded' && c.name === '자본적지출' && c.parent_id == null);
  if (!capexRoot) return {};
  const capexIds = new Set<number>([capexRoot.id]);
  for (const c of cats) if (c.parent_id === capexRoot.id) capexIds.add(c.id);

  const addMonths = (ym: string, k: number): string => {
    const [y, m] = ym.split('-').map(Number);
    const t = y * 12 + (m - 1) + k;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };

  const dep: Record<string, number> = {};
  for (const t of txns) {
    if (t.category_id == null || !capexIds.has(t.category_id) || !(t.amount_out > 0)) continue;
    const startYm = t.tx_at.slice(0, 7);
    const monthly = t.amount_out / usefulMonths;
    for (let k = 0; k < usefulMonths; k++) {
      const ym = addMonths(startYm, k);
      dep[ym] = (dep[ym] ?? 0) + monthly;
    }
  }
  for (const k of Object.keys(dep)) dep[k] = Math.round(dep[k]);
  return dep;
}
