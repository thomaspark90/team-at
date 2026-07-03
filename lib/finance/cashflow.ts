// 통장 현금흐름 집계: 월별 × 은행별 입금/출금 + 은행 합산.
// 분류(카테고리)와 무관하게 통장 자체의 인/아웃을 본다.

export interface BankCash {
  bank: string;
  inflow: number;
  outflow: number;
}
export interface MonthCash {
  ym: string;
  banks: BankCash[]; // 은행별
  totalIn: number; // 두 은행 합산 입금
  totalOut: number; // 두 은행 합산 출금
}

interface CashTx {
  ym: string;
  bank: string;
  amount_in: number;
  amount_out: number;
}

export function cashflow(txns: CashTx[]): MonthCash[] {
  const m = new Map<string, Map<string, { inflow: number; outflow: number }>>();
  for (const t of txns) {
    let bm = m.get(t.ym);
    if (!bm) {
      bm = new Map();
      m.set(t.ym, bm);
    }
    let b = bm.get(t.bank);
    if (!b) {
      b = { inflow: 0, outflow: 0 };
      bm.set(t.bank, b);
    }
    b.inflow += t.amount_in;
    b.outflow += t.amount_out;
  }

  return Array.from(m.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // 최신 월 위로
    .map(([ym, bm]) => {
      const banks = Array.from(bm.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([bank, v]) => ({ bank, inflow: v.inflow, outflow: v.outflow }));
      const totalIn = banks.reduce((a, b) => a + b.inflow, 0);
      const totalOut = banks.reduce((a, b) => a + b.outflow, 0);
      return { ym, banks, totalIn, totalOut };
    });
}
