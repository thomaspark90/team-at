// 월별 손익 집계 (EBIT 기준). 미분류·손익제외(excluded)는 제외.
// 매출=revenue 입금, 매출원가=cogs 출금, 판관비=sga 출금, 영업외=non_operating(입−출).

export interface AggCat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
}
export interface AggTx {
  ym: string;
  amount_in: number;
  amount_out: number;
  category_id: number | null;
}

export interface MonthAgg {
  ym: string;
  revenue: number;
  cogs: number;
  sga: number;
  ebit: number;
  nonOp: number;
  net: number;
  costRatio: number | null; // 재료비율 = 매출원가/매출
  profitRatio: number | null; // 손익률 = EBIT/매출
  expense: Record<string, number>; // 대분류명 → 지출합(cogs+sga)
}

export function aggregate(txns: AggTx[], cats: AggCat[]): { months: MonthAgg[]; expenseKeys: string[] } {
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
    let mo = m.get(t.ym);
    if (!mo) {
      mo = { ym: t.ym, revenue: 0, cogs: 0, sga: 0, ebit: 0, nonOp: 0, net: 0, costRatio: null, profitRatio: null, expense: {} };
      m.set(t.ym, mo);
    }
    if (c.type === 'revenue') {
      mo.revenue += t.amount_in;
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
    // excluded(자본적지출·보증금·내부이체)는 손익 집계에서 제외
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
