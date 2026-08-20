// 전처리3 — 매출 총합 (2026-08-20, 발생주의 정본화 같은 날).
//
// 회계 기준(대표 확정, 2026-08-20): **매출 평가는 POS 매출(발생주의·판매일)이 정본**이다.
// 관리손익(pnl)도 POS 기준이라 일관된다. 이 화면의 통장 입금 축은 매출 인식이 아니라
// **회수 검증**이다 — "장사값이 제대로 들어오고 있나"를 본다.
//
// 스탭밀 매출의 20~35%는 식권대장(운영 (주)현대벤디스)·올리브식권 같은 B2B 식권 앱 결제다.
// 손님이 앱으로 결제하면 POS엔 그날 매출로 찍히지만, 돈은 **다음 달 중순에 한 번에 정산**된다.
// 카드도 1~2영업일 늦는다. 그래서 '당월 입금 ÷ 당월 POS'는 매출 증감기에 69~160%로 널뛴다
// (2026-08-20 실측) — 입금 기준으로 월 성과를 읽으면 안 되는 이유가 이 표에 그대로 있다.
//
// 그래서 정산률은 두 개다:
//   - 정산률(원식): 당월 입금 ÷ 당월 POS — 현금흐름 그대로
//   - 정산률(보정): 식권류 입금을 전월로 귀속한 뒤의 비율 — 회수 정상 여부는 이걸 본다

import { bucketOf, type ExpenseGrain, type ExpenseTx } from './prepExpense';

export interface PosSaleRow {
  sale_date: string; // 'YYYY-MM-DD'
  gross: number;
}

export interface RevenueColumn {
  key: string;
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

/** 식권 앱 정산 입금 — 전월 장사값이 다음 달 중순에 들어온다. 사업자가 늘면 여기에 추가. */
export const MEAL_TICKET_RE = /식권대장|현대벤디스|올리브식권/;

/** 보정 정산률의 정상 범위 — 밖이면 회수에 문제가 있다는 신호 */
const RATE_OK_MIN = 90;
const RATE_OK_MAX = 105;

/** 'YYYY-MM' 한 달 전 */
const prevYm = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
};

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

  // 통장 입금 — 식권 앱 정산은 별도 축으로 뗀다(전월분이라 당월 계정 열과 성격이 다르다).
  // 나머지는 revenue 계정별. 환불(출금)은 순액으로 자연 차감.
  const perCat = new Map<string, Record<string, number>>();
  const mealTicket: Record<string, number> = {};
  for (const t of txns) {
    const b = bucketOf(t, grain);
    const net = (t.amount_in || 0) - (t.amount_out || 0);
    if (MEAL_TICKET_RE.test(t.memo ?? '')) {
      add(mealTicket, b, net);
      continue;
    }
    const name = t.cat_name ?? '기타매출';
    const m = perCat.get(name) ?? {};
    add(m, b, net);
    perCat.set(name, m);
  }

  const buckets = Array.from(
    new Set([
      ...Object.keys(posAmt),
      ...Array.from(perCat.values()).flatMap((m) => Object.keys(m)),
      ...Object.keys(mealTicket),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const inTotal: Record<string, number> = {};
  for (const m of Array.from(perCat.values()))
    for (const [b, v] of Object.entries(m)) add(inTotal, b, v);
  for (const [b, v] of Object.entries(mealTicket)) add(inTotal, b, v);

  // 보정 입금 — 식권류를 전월(장사한 달)로 귀속. 월 뷰에서만 의미가 있다.
  const adjusted: Record<string, number> = {};
  if (isMonth) {
    for (const m of Array.from(perCat.values()))
      for (const [b, v] of Object.entries(m)) add(adjusted, b, v);
    for (const [b, v] of Object.entries(mealTicket)) add(adjusted, prevYm(b), v);
  }

  const diff: Record<string, number> = {};
  const rate: Record<string, number> = {};
  const rateAdj: Record<string, number> = {};
  const warnings: { bucket: string; message: string }[] = [];
  const latestYm = buckets[0]; // 최신 달 — 식권 정산이 아직 안 들어와 보정률이 낮게 나오는 게 정상
  for (const b of buckets) {
    const p = posAmt[b] ?? 0;
    const i = inTotal[b] ?? 0;
    diff[b] = i - p;
    if (p > 0) {
      rate[b] = Math.round((i * 1000) / p) / 10;
      if (isMonth) {
        const a = adjusted[b] ?? 0;
        rateAdj[b] = Math.round((a * 1000) / p) / 10;
        // 최신 1~2개월은 식권 정산·은행 자료가 아직이라 판정 보류
        const isRecent = b >= prevYm(latestYm);
        if (!isRecent && (rateAdj[b] < RATE_OK_MIN || rateAdj[b] > RATE_OK_MAX)) {
          warnings.push({
            bucket: b,
            message:
              rateAdj[b] > 100
                ? `보정 정산률 ${rateAdj[b]}% — 식권 시차를 감안해도 입금이 POS보다 많아요. 자가 식권 판매(선수금 — POS 매출엔 없고 카드 입금엔 포함, 월 900만원 규모)나 POS 밖 매출이 후보예요.`
                : `보정 정산률 ${rateAdj[b]}% — 식권 시차를 감안해도 입금이 부족해요. 은행 자료 누락이나 미정산 후보예요.`,
          });
        }
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
      label: 'POS 매출 (정본)',
      kind: 'pos',
      amounts: posAmt,
      hint: '판매일 기준 매출(발생주의) — 월 성과 평가는 이 열이 정본이에요. 관리손익도 이 기준이에요. 식권 판매는 선수금이라 제외돼 있어요.',
    },
    ...incomeColumns,
    {
      key: 'meal_ticket',
      label: '식권 정산 (전월분)',
      kind: 'income',
      cat: '기타매출',
      amounts: mealTicket,
      hint: '식권대장(현대벤디스)·올리브식권 정산 — 손님은 지난달에 결제했고 돈이 이번 달 중순에 들어온 거예요. 이번 달 장사값이 아니에요.',
    },
    {
      key: 'in_total',
      label: '통장 입금 합계',
      kind: 'total',
      amounts: inTotal,
      hint: '매출 계정으로 분류된 통장 입금의 순액(환불 차감) — 현금흐름 그대로.',
    },
    {
      key: 'rate',
      label: '정산률 %',
      kind: 'derived',
      amounts: rate,
      hint: '당월 입금 ÷ 당월 POS — 식권·카드 시차 때문에 매출 증감기에 크게 널뛰어요. 참고용.',
    },
    ...(isMonth
      ? [
          {
            key: 'rate_adj',
            label: '보정 정산률 %',
            kind: 'derived' as const,
            amounts: rateAdj,
            hint: `식권 정산을 장사한 달(전월)로 되돌린 비율 — 회수가 정상인지는 이걸 봐요. ${RATE_OK_MIN}~${RATE_OK_MAX}% 밖이면 ⚠. 최신 1~2개월은 정산이 아직이라 낮게 나오는 게 정상이에요.`,
          },
        ]
      : []),
  ];

  return { grain, buckets, columns, warnings };
}
