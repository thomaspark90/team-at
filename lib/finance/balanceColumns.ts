// 전처리1·3의 '월말 잔액' 참고 열 (2026-08-23 그릴 확정 — 가든 양재 통장 2개 대응).
//
// 규칙:
//  - 월 뷰 전용 — 잔액은 시점 스냅샷이라 일·주 뷰에는 넣지 않는다(호출부가 grain 으로 거른다).
//  - 계좌가 2개 이상일 때만 계좌별 열을 만들고, 항상 '합산' 열을 만든다(1개면 합산만 = 그 계좌).
//  - 값은 월별 요약과 같은 계산(cashflow: 계좌별 앵커 + 거래 없는 달 이월) — 화면 간 정합.
//  - 지출·매출 합계와 섞이지 않는 참고(note) 성격 — 빌더 합계 불변식 밖.

import type { MonthCash } from './cashflow';
import { bankShort } from './cashflow';

export interface BalanceColumn {
  key: string; // 'bal:shinhan' | 'bal:total'
  label: string;
  amounts: Record<string, number>; // ym → 월말 잔액
  hint: string;
}

export function buildBalanceColumns(bankMonths: MonthCash[]): BalanceColumn[] {
  if (bankMonths.length === 0) return [];
  const banks = Array.from(new Set(bankMonths.flatMap((m) => m.banks.map((b) => b.bank)))).sort();
  const perBank = new Map<string, Record<string, number>>();
  const total: Record<string, number> = {};
  for (const m of bankMonths) {
    total[m.ym] = m.totalBalance;
    for (const b of m.banks) {
      const rec = perBank.get(b.bank) ?? {};
      rec[m.ym] = b.balance;
      perBank.set(b.bank, rec);
    }
  }
  const cols: BalanceColumn[] = [];
  if (banks.length >= 2) {
    for (const bank of banks) {
      cols.push({
        key: `bal:${bank}`,
        label: `월말 잔액 · ${bankShort(bank)}`,
        amounts: perBank.get(bank) ?? {},
        hint: `${bankShort(bank)} 계좌의 월말 잔액(거래 없는 달은 직전 잔액 이월) — 월별 요약의 은행별 상세와 같은 값이에요.`,
      });
    }
  }
  cols.push({
    key: 'bal:total',
    label: banks.length >= 2 ? '월말 잔액 (합산)' : '월말 잔액',
    amounts: total,
    hint: '전 계좌 월말 잔액 합 — 지출·매출 합계에는 안 들어가는 참고 열이에요.',
  });
  return cols;
}
