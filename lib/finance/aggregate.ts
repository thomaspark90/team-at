// 월/주 단위 손익 집계 (EBIT 기준). 미분류·손익제외는 제외.

// 부가세: 통장 입금액은 VAT 포함 총액이라, 손익상 매출은 공급가액(총액/1.1)이 맞음.
// 과세 10% 가정(카페 음료·식음료). 이자수익 등 영업외(면세)는 순액화 대상 아님.
export const VAT_DIVISOR = 1.1;

export interface AggCat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
}
export interface AggTx {
  tx_at: string; // ISO
  amount_in: number;
  amount_out: number;
  category_id: number | null;
}
export type Unit = 'month' | 'week';

export interface MonthAgg {
  ym: string; // period key (월: YYYY-MM, 주: 그 주 월요일 YYYY-MM-DD)
  revenue: number;
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
): { months: MonthAgg[]; expenseKeys: string[] } {
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const nameOf = (c: AggCat): string => {
    if (c.parent_id != null) {
      const p = cats.find((x) => x.id === c.parent_id);
      return p ? p.name : c.name;
    }
    return c.name;
  };

  const m = new Map<string, MonthAgg>();
  const expenseKeys = new Set<string>();

  for (const t of txns) {
    if (t.category_id == null) continue;
    const c = catMap.get(t.category_id);
    if (!c) continue;
    const key = periodKey(t.tx_at, unit);
    let mo = m.get(key);
    if (!mo) {
      mo = { ym: key, revenue: 0, cogs: 0, sga: 0, ebit: 0, nonOp: 0, net: 0, costRatio: null, profitRatio: null, expense: {} };
      m.set(key, mo);
    }
    if (c.type === 'revenue') {
      // 순액 모드: 공급가액(총액/1.1)으로 매출 인식. VAT는 손익이 아닌 예수금이라 제외.
      mo.revenue += netVat ? Math.round(t.amount_in / VAT_DIVISOR) : t.amount_in;
    } else if (c.type === 'cogs') {
      mo.cogs += t.amount_out;
      const k = nameOf(c);
      mo.expense[k] = (mo.expense[k] || 0) + t.amount_out;
      expenseKeys.add(k);
    } else if (c.type === 'sga') {
      mo.sga += t.amount_out;
      const k = nameOf(c);
      mo.expense[k] = (mo.expense[k] || 0) + t.amount_out;
      expenseKeys.add(k);
    } else if (c.type === 'non_operating') {
      mo.nonOp += t.amount_in - t.amount_out;
    }
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
