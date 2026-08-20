// 월별 요약 대사 — 통장 현금흐름을 전처리1(지출)·전처리3(매출)과 나란히 놓는다 (2026-08-20).
//
// 통장 숫자 자체는 원본과 일치하지만(잔액 연속성 전 구간 검증), 통장만 보면 전처리 화면과
// "왜 다른지"가 숨는다 — 식권 정산 시차, 자가 식권 선수금, 대여금·투자 같은 비용 외 출금이
// 전부 통장에는 섞여 있기 때문. 이 모듈은 그 차이를 숫자로 드러낸다.
//
// 계산은 전처리와 **같은 빌더**(buildExpensePrep·buildRevenuePrep)의 월 뷰 결과를 그대로 받아
// 붙인다 — 여기서 다시 집계하면 두 화면이 어긋날 수 있어서, 재계산은 통장에만 있는 두 열
// (매출 외 입금·비용 외 출금)로 한정한다.

import type { MonthCash } from './cashflow';
import type { ExpensePrep, ExpenseTx } from './prepExpense';
import type { RevenuePrep } from './prepRevenue';
import { CARD_PAYMENT_RE } from './cardOffset';

export interface ReconMonth {
  ym: string;
  /** 통장 — 은행 자료가 없는 달(예: 아직 업로드 전)은 null */
  bankIn: number | null;
  bankOut: number | null;
  net: number | null;
  balance: number | null;
  /** 매출 대사 — 전처리3 월 뷰와 동일한 값 */
  posSales: number;
  salesIn: number; // 매출 계정 입금 순액(통장 입금 합계 열)
  mealTicket: number; // 식권 정산(전월분)
  rateAdj: number | null; // 보정 정산률 %
  nonSalesIn: number | null; // 매출 외 입금 = 통장 입금 − 매출 계정 입금(총액)
  /** 지출 대사 — 전처리1 월 뷰와 동일한 값 */
  expenseTotal: number; // 지출 합계(비용)
  nonExpenseOut: number | null; // 비용 외 출금 — 대여금·투자·카드대금정산 등 분류된 비(非)비용 출금
  bankMissing: boolean; // POS 등 다른 자료는 있는데 은행 자료가 없는 달
}

export interface CashflowRecon {
  months: ReconMonth[];
  /** 전처리1·3 경고에 은행 누락 경고를 더한 것 — 숨기지 않고 이 화면에도 보여준다 */
  warnings: { bucket: string; message: string }[];
}

const colAmounts = (prep: RevenuePrep, key: string): Record<string, number> =>
  prep.columns.find((c) => c.key === key)?.amounts ?? {};
const rowAmounts = (prep: ExpensePrep, key: string): Record<string, number> =>
  prep.rows.find((r) => r.key === key)?.amounts ?? {};

/** 지출로 집계되는 계정 성격 — prepExpense의 EXPENSE_TYPES와 같은 정의 */
const EXPENSE_TYPES = new Set(['cogs', 'sga']);

export function buildCashflowRecon(
  bankMonths: MonthCash[], // cashflow() 결과 — 최신 월이 앞
  expense: ExpensePrep, // buildExpensePrep(txns, 'month')
  revenue: RevenuePrep, // buildRevenuePrep(pos, revenueTxns, 'month')
  txns: ExpenseTx[] // 전 소스 거래 — 매출 외 입금·비용 외 출금 계산용 (source 포함)
): CashflowRecon {
  const bankBy = new Map(bankMonths.map((m) => [m.ym, m]));
  const posAmt = colAmounts(revenue, 'pos');
  const salesInAmt = colAmounts(revenue, 'in_total');
  const mealAmt = colAmounts(revenue, 'meal_ticket');
  const rateAdjAmt = colAmounts(revenue, 'rate_adj');
  const expTotalAmt = rowAmounts(expense, 'total');

  // 통장에만 있는 두 열 — 총액(gross) 기준이라 통장 입금·출금과 직접 비교할 수 있다.
  const revenueInGross: Record<string, number> = {}; // 매출 계정으로 분류된 은행 입금 총액
  const nonExpenseOutGross: Record<string, number> = {}; // 비용으로 안 세는 분류된 은행 출금 총액
  for (const t of txns) {
    if (t.source !== 'bank') continue;
    if (t.cat_type === 'revenue') revenueInGross[t.ym] = (revenueInGross[t.ym] ?? 0) + (t.amount_in || 0);
    // 전처리1이 지출로 세지 않는 은행 출금: 분류돼 있고(미분류는 지출에 포함),
    // 비용 계정도 '미상'도 아니고, 카드대금 인출(카드 기타지출로 환산됨)도 아닌 것 —
    // 대여금·투자·개인·카드대금정산 같은 계정이 여기 모인다.
    const isNonExpense =
      t.category_id != null &&
      t.cat_type != null &&
      !EXPENSE_TYPES.has(t.cat_type) &&
      t.cat_name !== '미상' &&
      t.cat_type !== 'revenue' && // 매출 환불은 매출 축(순액)에서 이미 차감
      !CARD_PAYMENT_RE.test(t.memo ?? '');
    if (isNonExpense && (t.amount_out || 0) > 0)
      nonExpenseOutGross[t.ym] = (nonExpenseOutGross[t.ym] ?? 0) + t.amount_out;
  }

  // 달 목록 = 통장 ∪ 전처리 — 은행 자료가 없는 달(예: POS만 있는 최근 달)도 줄로 드러낸다
  const yms = Array.from(
    new Set([
      ...bankMonths.map((m) => m.ym),
      ...Object.keys(posAmt),
      ...Object.keys(salesInAmt),
      ...Object.keys(expTotalAmt),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const months: ReconMonth[] = yms.map((ym) => {
    const bank = bankBy.get(ym) ?? null;
    const bankMissing = !bank && ((posAmt[ym] ?? 0) !== 0 || (expTotalAmt[ym] ?? 0) !== 0);
    return {
      ym,
      bankIn: bank ? bank.totalIn : null,
      bankOut: bank ? bank.totalOut : null,
      net: bank ? bank.totalIn - bank.totalOut : null,
      balance: bank ? bank.totalBalance : null,
      posSales: posAmt[ym] ?? 0,
      salesIn: salesInAmt[ym] ?? 0,
      mealTicket: mealAmt[ym] ?? 0,
      // 은행 자료가 없는 달의 정산률은 입금이 0이라 무의미 — 비워서 오독을 막는다
      rateAdj: bankMissing ? null : (rateAdjAmt[ym] ?? null),
      nonSalesIn: bank ? bank.totalIn - (revenueInGross[ym] ?? 0) : null,
      expenseTotal: expTotalAmt[ym] ?? 0,
      nonExpenseOut: bank ? (nonExpenseOutGross[ym] ?? 0) : null,
      bankMissing,
    };
  });

  // 경고 — 은행 자료가 없는 달들은 한 줄로 묶는다(원인이 같아 달마다 반복하면 소음).
  // 그 달들의 전처리 파생 경고(카드대금 없음·정산률 0%)도 같은 원인이라 건다 만다 하지 않고 거른다.
  const warnings: { bucket: string; message: string }[] = [];
  const missing = new Set(months.filter((m) => m.bankMissing).map((m) => m.ym));
  if (missing.size > 0) {
    // 연속 구간으로 묶기 — '2023-10~2024-12 · 2026-07~2026-08' 형태
    const asc = Array.from(missing).sort();
    const ranges: string[] = [];
    let start = asc[0];
    let prev = asc[0];
    const nextYm = (ym: string) => {
      const [y, mo] = ym.split('-').map(Number);
      return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
    };
    for (const ym of asc.slice(1).concat('END')) {
      if (ym !== nextYm(prev)) {
        ranges.push(start === prev ? start : `${start}~${prev}`);
        start = ym;
      }
      prev = ym;
    }
    warnings.push({
      bucket: ranges.join(' · '),
      message: '은행 자료가 없는 달이에요 — 통장 열이 비어 있고, 지출도 수집분만 잡혀 실제보다 적어요.',
    });
  }
  // 전처리 경고도 함께 — 이 화면에서 발견하고 전처리로 파고들 수 있게
  for (const w of expense.warnings) if (!missing.has(w.bucket)) warnings.push(w);
  for (const w of revenue.warnings) if (!missing.has(w.bucket)) warnings.push(w);
  warnings.sort((a, b) => b.bucket.localeCompare(a.bucket));

  return { months, warnings };
}
