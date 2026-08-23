// 통장 현금흐름 집계: 월별 × 은행별 입금/출금 + 은행 합산.
// 분류(카테고리)와 무관하게 통장 자체의 인/아웃을 본다.

/** 은행 축약 표기 — 계좌별 잔액 분해 열·부제에 쓴다(2026-08-23 그릴 확정: 은행명만, 역할 라벨 없음) */
export const BANK_SHORT: Record<string, string> = { shinhan: '신한', woori: '우리', excel: '엑셀' };
export const bankShort = (bank: string): string => BANK_SHORT[bank] ?? bank;

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

/**
 * 순서에 의존하지 않는 월말 잔액 — 유일 시각 앵커 방식.
 *
 * 같은 시각(분 단위) 거래 묶음은 은행 파일의 정렬 방향에 따라 순서가 뒤집힐 수 있다 —
 * 실제로 스탭밀 우리은행 자료가 기간별 오름차순·내림차순 두 포맷으로 섞여 들어와(2026-08-20 발견),
 * '마지막 행의 잔액'을 고르면 2024-10~12 월말 잔액이 어긋났다. 그래서 그 달에서 시각이 유일한
 * (= 순서 모호성이 없는) 마지막 거래를 앵커로 잡고, 그 뒤 거래들의 순유입을 더해 참 잔액을 만든다.
 * 잔액 0은 미기재(엑셀 일부)라 앵커 후보에서 제외. 전 35개월 잔액 연속성 diff 0 검증(2026-08-20).
 */
export function monthEndBalance(
  rows: { tx_at: string; amount_in: number; amount_out: number; balance: number }[]
): number | null {
  const cnt = new Map<string, number>();
  for (const r of rows) cnt.set(r.tx_at, (cnt.get(r.tx_at) ?? 0) + 1);
  let anchor: (typeof rows)[number] | null = null;
  for (const r of rows) {
    if (cnt.get(r.tx_at) === 1 && r.balance !== 0 && (!anchor || r.tx_at > anchor.tx_at)) anchor = r;
  }
  if (!anchor) {
    // 유일 시각이 하나도 없는 달(사실상 없음) — 마지막 시각의 아무 잔액으로 폴백
    let last: (typeof rows)[number] | null = null;
    for (const r of rows) if (r.balance !== 0 && (!last || r.tx_at >= last.tx_at)) last = r;
    return last ? last.balance : null;
  }
  let end = anchor.balance;
  for (const r of rows) if (r.tx_at > anchor.tx_at) end += r.amount_in - r.amount_out;
  return end;
}

export function cashflow(txns: CashTx[]): MonthCash[] {
  const allBanks = Array.from(new Set(txns.map((t) => t.bank))).sort();

  // (월, 은행)별로 행을 모아 합계와 월말 잔액(앵커 방식)을 계산한다
  const m = new Map<string, Map<string, CashTx[]>>();
  for (const t of txns) {
    let bm = m.get(t.ym);
    if (!bm) {
      bm = new Map();
      m.set(t.ym, bm);
    }
    const arr = bm.get(t.bank);
    if (arr) arr.push(t);
    else bm.set(t.bank, [t]);
  }

  // 과거→최신 순으로 훑으며 통장별 마지막 잔액을 이월(거래 없는 달·잔액 미기재 달도 잔액 유지).
  const carried = new Map<string, number>();
  const asc = Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
  const result: MonthCash[] = asc.map((ym) => {
    const bm = m.get(ym)!;
    const banks: BankCash[] = allBanks.map((bank) => {
      const rows = bm.get(bank);
      let inflow = 0;
      let outflow = 0;
      if (rows) {
        for (const r of rows) {
          inflow += r.amount_in;
          outflow += r.amount_out;
        }
        const end = monthEndBalance(rows);
        if (end != null) carried.set(bank, end);
      }
      return { bank, inflow, outflow, balance: carried.get(bank) ?? 0 };
    });
    const totalIn = banks.reduce((a, b) => a + b.inflow, 0);
    const totalOut = banks.reduce((a, b) => a + b.outflow, 0);
    const totalBalance = banks.reduce((a, b) => a + b.balance, 0);
    return { ym, banks, totalIn, totalOut, totalBalance };
  });

  return result.reverse(); // 최신 월 위로
}
