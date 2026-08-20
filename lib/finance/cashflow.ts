// 통장 현금흐름 집계: 월별 × 은행별 입금/출금 + 은행 합산.
// 분류(카테고리)와 무관하게 통장 자체의 인/아웃을 본다.

export interface BankCash {
  bank: string;
  inflow: number;
  outflow: number;
  balance: number; // 월말 잔액 — 그 달 마지막 거래의 잔액(거래 없는 달은 직전 잔액 이월)
}
export interface MonthCash {
  ym: string;
  banks: BankCash[]; // 은행별
  totalIn: number; // 두 은행 합산 입금
  totalOut: number; // 두 은행 합산 출금
  totalBalance: number; // 두 은행 월말 잔액 합
}

interface CashTx {
  ym: string;
  bank: string;
  tx_at: string; // ISO — 월말 잔액을 고르기 위한 정렬 키
  amount_in: number;
  amount_out: number;
  balance: number; // 거래 직후 잔액(PDF 잔액 컬럼)
}

// ⚠️ 동시각 거래가 있으면 tx_at만으로는 마지막 거래를 못 가른다 — 호출부에서
// id(명세 순서) 오름차순으로 정렬해 넘겨야 월말 잔액이 안정적으로 잡힌다.

interface Agg {
  inflow: number;
  outflow: number;
  lastAt: string; // 이 달 마지막 거래 시각
  balance: number; // 이 달 마지막 거래의 잔액
}

export function cashflow(txns: CashTx[]): MonthCash[] {
  const allBanks = Array.from(new Set(txns.map((t) => t.bank))).sort();

  const m = new Map<string, Map<string, Agg>>();
  for (const t of txns) {
    let bm = m.get(t.ym);
    if (!bm) {
      bm = new Map();
      m.set(t.ym, bm);
    }
    let b = bm.get(t.bank);
    if (!b) {
      b = { inflow: 0, outflow: 0, lastAt: '', balance: 0 };
      bm.set(t.bank, b);
    }
    b.inflow += t.amount_in;
    b.outflow += t.amount_out;
    // 잔액 0 = 미기재(엑셀 일부) — 월말 잔액 후보에서 제외(지표 페이지와 동일 규칙)
    if (t.balance !== 0 && t.tx_at >= b.lastAt) {
      b.lastAt = t.tx_at;
      b.balance = t.balance;
    }
  }

  // 과거→최신 순으로 훑으며 통장별 마지막 잔액을 이월(거래 없는 달도 잔액 유지).
  const carried = new Map<string, number>();
  const asc = Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
  const result: MonthCash[] = asc.map((ym) => {
    const bm = m.get(ym)!;
    const banks: BankCash[] = allBanks.map((bank) => {
      const v = bm.get(bank);
      if (v && v.balance !== 0) carried.set(bank, v.balance); // 잔액 미기재만 있던 달은 직전 잔액 유지
      return {
        bank,
        inflow: v?.inflow ?? 0,
        outflow: v?.outflow ?? 0,
        balance: carried.get(bank) ?? 0,
      };
    });
    const totalIn = banks.reduce((a, b) => a + b.inflow, 0);
    const totalOut = banks.reduce((a, b) => a + b.outflow, 0);
    const totalBalance = banks.reduce((a, b) => a + b.balance, 0);
    return { ym, banks, totalIn, totalOut, totalBalance };
  });

  return result.reverse(); // 최신 월 위로
}
