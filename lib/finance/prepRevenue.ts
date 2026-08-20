// 전처리3 — 매출 총합 (2026-08-20).
//
// 매출의 두 원천을 나란히 놓고 대사한다:
//   ① POS 매출(pos_sales) — 손님이 결제한 시점의 '발생' 매출
//   ② 통장 입금(transactions revenue 계정) — 카드사·PG가 실제로 넣어준 '정산' 입금
//
// 둘은 같아야 할 것 같지만 구조적으로 어긋난다:
//   - 정산 시차: 카드매출은 1~2영업일 뒤 입금(월말 매출은 다음 달 입금)
//   - 식권 선수금: 식권 판매는 POS 매출에서 제외(선수금)되지만 카드 입금에는 포함
//   - POS 밖 매출: 케이터링·B2B 같은 계좌 직접 입금은 POS에 없다
// 그래서 이 화면은 '차이를 없애는' 게 아니라 **차이를 보이게** 한다 — 정산률이 이상한
// 구간이 곧 조사할 지점이다(실측: 스탭밀 월 정산률 88~160% 널뜀, 2026-08-20).

import { bucketOf, type ExpenseGrain, type ExpenseTx } from './prepExpense';

export interface PosSaleRow {
  sale_date: string; // 'YYYY-MM-DD'
  gross: number;
}

export interface RevenueColumn {
  key: string; // 'pos' | 'in:카드매출' | 'in_total' | 'diff' | 'rate'
  label: string;
  kind: 'pos' | 'income' | 'total' | 'derived';
  /** 분류 화면 드릴다운용 — income 열이면 계정 이름 */
  cat?: string;
  amounts: Record<string, number>;
  hint?: string;
}

export interface RevenuePrep {
  grain: ExpenseGrain;
  buckets: string[];
  columns: RevenueColumn[];
  warnings: { bucket: string; message: string }[];
}

const add = (m: Record<string, number>, k: string, v: number) => {
  m[k] = (m[k] ?? 0) + v;
};

/** 월 뷰에서만 정산률을 따진다 — 일·주는 정산 시차 때문에 어긋나는 게 정상이라 경고가 소음이 된다 */
const RATE_OK_MIN = 95;
const RATE_OK_MAX = 115;

export function buildRevenuePrep(
  pos: PosSaleRow[],
  txns: ExpenseTx[], // revenue 계정으로 분류된 거래만 넘겨받는다
  grain: ExpenseGrain = 'month'
): RevenuePrep {
  const isMonth = grain === 'month';

  const posAmt: Record<string, number> = {};
  for (const p of pos) {
    const b =
      grain === 'month' ? p.sale_date.slice(0, 7) : bucketOf({ tx_at: p.sale_date } as ExpenseTx, grain);
    add(posAmt, b, p.gross);
  }

  // 통장 입금 — revenue 계정별. 환불(출금)은 순액으로 자연 차감.
  const perCat = new Map<string, Record<string, number>>();
  for (const t of txns) {
    const b = bucketOf(t, grain);
    const net = (t.amount_in || 0) - (t.amount_out || 0);
    const name = t.cat_name ?? '기타매출';
    const m = perCat.get(name) ?? {};
    add(m, b, net);
    perCat.set(name, m);
  }

  const buckets = Array.from(
    new Set([...Object.keys(posAmt), ...Array.from(perCat.values()).flatMap((m) => Object.keys(m))])
  ).sort((a, b) => b.localeCompare(a));

  const inTotal: Record<string, number> = {};
  for (const m of Array.from(perCat.values()))
    for (const [b, v] of Object.entries(m)) add(inTotal, b, v);

  const diff: Record<string, number> = {};
  const rate: Record<string, number> = {};
  const warnings: { bucket: string; message: string }[] = [];
  for (const b of buckets) {
    const p = posAmt[b] ?? 0;
    const i = inTotal[b] ?? 0;
    diff[b] = i - p;
    if (p > 0) {
      rate[b] = Math.round((i * 1000) / p) / 10;
      if (isMonth && (rate[b] < RATE_OK_MIN || rate[b] > RATE_OK_MAX)) {
        warnings.push({
          bucket: b,
          message:
            rate[b] > 100
              ? `입금이 POS 매출보다 ${Math.abs(diff[b]).toLocaleString()}원 많아요(정산률 ${rate[b]}%) — 식권 선수금·POS 밖 입금(케이터링 등)·전월 정산 이월이 후보예요.`
              : `입금이 POS 매출보다 ${Math.abs(diff[b]).toLocaleString()}원 적어요(정산률 ${rate[b]}%) — 은행 자료 누락이나 월말 매출의 다음 달 정산 이월이 후보예요.`,
        });
      }
    }
  }

  // 입금 열 — 총액 큰 순(카드매출이 보통 첫 열)
  const incomeColumns: RevenueColumn[] = Array.from(perCat.entries())
    .map(([name, amounts]) => ({
      key: `in:${name}`,
      label: name,
      kind: 'income' as const,
      cat: name,
      amounts,
      _sum: Object.values(amounts).reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b._sum - a._sum)
    .map(({ _sum, ...c }) => c);

  const columns: RevenueColumn[] = [
    {
      key: 'pos',
      label: 'POS 매출',
      kind: 'pos',
      amounts: posAmt,
      hint: '손님이 결제한 시점의 매출(부가세 포함 총액). 식권 판매는 선수금이라 제외돼 있어요.',
    },
    ...incomeColumns,
    {
      key: 'in_total',
      label: '통장 입금 합계',
      kind: 'total',
      amounts: inTotal,
      hint: '매출 계정으로 분류된 통장 입금의 순액(환불 차감).',
    },
    {
      key: 'diff',
      label: '차이 (입금−POS)',
      kind: 'derived',
      amounts: diff,
      hint: '정산 시차·식권 선수금·POS 밖 매출이 여기에 나타나요. 0에 가까울수록 두 원천이 맞는 거예요.',
    },
    {
      key: 'rate',
      label: '정산률 %',
      kind: 'derived',
      amounts: rate,
      hint: `통장 입금 ÷ POS 매출. 월 기준 ${RATE_OK_MIN}~${RATE_OK_MAX}% 밖이면 ⚠ 로 표시해요.`,
    },
  ];

  return { grain, buckets, columns, warnings };
}
