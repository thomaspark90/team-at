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

// 자가 식권 판매(선수금) — pos_gift_sales. POS 매출엔 없고 카드 입금엔 포함되는 돈이라
// 정산률 100% 초과의 주 원인. 열로 나란히 놓아 초과분을 실측으로 설명한다(2026-08-20).
export interface GiftSaleRow {
  sale_date: string;
  gross: number;
}

export interface RevenueColumn {
  key: string;
  label: string;
  kind: 'pos' | 'income' | 'total' | 'derived' | 'note';
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

/** 'YYYY-MM' 한 달 후 */
const nextYm = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
};

// 브랜드 프로파일 — 회수(입금) 구조가 달라 정산률 산식이 갈린다(2026-08-23 대표 확인).
//   staffmeal: 식권 앱 정산(전월분 익월 중순 입금)이 커서 '보정 정산률'(식권 전월 귀속)이 정본.
//   garden:    식권 사업자가 아예 없다. 회수 시차는 카드 매입 정산(D+1~2)·간편결제 정산뿐이라
//              보정 없이 원식 정산률로 보되, 월말 며칠치가 다음 달로 넘어가는 이월만 감안한다.
export type RevenueProfile = 'staffmeal' | 'garden';

export function buildRevenuePrep(
  pos: PosSaleRow[],
  txns: ExpenseTx[], // revenue 계정으로 분류된 거래만 넘겨받는다
  grain: ExpenseGrain = 'month',
  gift: GiftSaleRow[] = [], // 자가 식권 판매(선수금) — 없으면 열 생략
  // 미분류 '입금' 거래(계정 없음 + amount_in>0) — 참고 열 전용(2026-08-21 감사 P2-1).
  // 분류 전 매출 입금이 여기 숨으면 정산률이 낮게 나와 '미정산' 오진 경고가 뜬다.
  // 정산률·입금 합계에는 넣지 않는다(계정 미확정 돈을 매출로 단정하지 않는 보수 원칙) —
  // 열로 드러내 "분류하면 정산률이 오를 수 있는 몫"임을 보여주기만 한다.
  unclassifiedIn: ExpenseTx[] = [],
  profile: RevenueProfile = 'staffmeal'
): RevenuePrep {
  const isMonth = grain === 'month';
  // 식권 축은 스탭밀 전용 — 가든에서 식권류 memo가 우연히 매칭돼도 별도 축으로 빼지 않는다.
  const hasMealTicket = profile === 'staffmeal';

  const posAmt: Record<string, number> = {};
  for (const p of pos) {
    const b =
      grain === 'month' ? p.sale_date.slice(0, 7) : bucketOf({ tx_at: p.sale_date } as ExpenseTx, grain);
    add(posAmt, b, p.gross);
  }

  const giftAmt: Record<string, number> = {};
  for (const g of gift) {
    const b =
      grain === 'month' ? g.sale_date.slice(0, 7) : bucketOf({ tx_at: g.sale_date } as ExpenseTx, grain);
    add(giftAmt, b, g.gross);
  }

  // 통장 입금 — 식권 앱 정산은 별도 축으로 뗀다(전월분이라 당월 계정 열과 성격이 다르다).
  // 나머지는 revenue 계정별. 환불(출금)은 순액으로 자연 차감.
  const perCat = new Map<string, Record<string, number>>();
  const mealTicket: Record<string, number> = {};
  for (const t of txns) {
    const b = bucketOf(t, grain);
    const net = (t.amount_in || 0) - (t.amount_out || 0);
    if (hasMealTicket && MEAL_TICKET_RE.test(t.memo ?? '')) {
      add(mealTicket, b, net);
      continue;
    }
    const name = t.cat_name ?? '기타매출';
    const m = perCat.get(name) ?? {};
    add(m, b, net);
    perCat.set(name, m);
  }

  const unclassifiedAmt: Record<string, number> = {};
  for (const t of unclassifiedIn) {
    if ((t.amount_in || 0) > 0) add(unclassifiedAmt, bucketOf(t, grain), t.amount_in);
  }

  const buckets = Array.from(
    new Set([
      ...Object.keys(posAmt),
      ...Array.from(perCat.values()).flatMap((m) => Object.keys(m)),
      ...Object.keys(mealTicket),
      ...Object.keys(unclassifiedAmt),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const inTotal: Record<string, number> = {};
  for (const m of Array.from(perCat.values()))
    for (const [b, v] of Object.entries(m)) add(inTotal, b, v);
  for (const [b, v] of Object.entries(mealTicket)) add(inTotal, b, v);

  // 보정 입금 — 식권류를 전월(장사한 달)로 귀속. 월 뷰·스탭밀에서만 의미가 있다
  // (가든은 식권이 없어 보정 축 자체가 성립하지 않는다 — 원식 정산률이 그대로 판정 기준).
  const adjusted: Record<string, number> = {};
  if (isMonth && hasMealTicket) {
    for (const m of Array.from(perCat.values()))
      for (const [b, v] of Object.entries(m)) add(adjusted, b, v);
    for (const [b, v] of Object.entries(mealTicket)) add(adjusted, prevYm(b), v);
  }

  // 매출 정본 = 메뉴 매출 + 자가 식권 판매(2026-08-20 대표·매니저 확인: 자가 식권 사용은
  // POS에 안 찍히므로 판매 시점 인식이 이중계상 없이 성립 — 오히려 제외하면 매출 누락).
  const posTotalAmt: Record<string, number> = {};
  for (const [b, v] of Object.entries(posAmt)) add(posTotalAmt, b, v);
  for (const [b, v] of Object.entries(giftAmt)) add(posTotalAmt, b, v);

  const diff: Record<string, number> = {};
  const rate: Record<string, number> = {};
  const rateAdj: Record<string, number> = {};
  const warnings: { bucket: string; message: string }[] = [];
  const latestYm = buckets[0]; // 최신 달 — 식권 정산이 아직 안 들어와 보정률이 낮게 나오는 게 정상
  for (const b of buckets) {
    const p = posTotalAmt[b] ?? 0;
    const i = inTotal[b] ?? 0;
    diff[b] = i - p;
    if (p > 0) {
      rate[b] = Math.round((i * 1000) / p) / 10;
      if (isMonth && hasMealTicket) rateAdj[b] = Math.round(((adjusted[b] ?? 0) * 1000) / p) / 10;
    }
  }

  // 경고 판정 — 전 달의 판정 비율이 나온 뒤에 돈다. 스탭밀은 식권대장 정산이 가끔 한 달
  // 건너뛰어 다음 달에 두 달치가 합산 입금되고(2025-12→2026-01, 2026-06→2026-07 실측),
  // 가든은 월말 카드 매입 정산(D+1~2)이 다음 달 초 입금으로 넘어간다. 어느 쪽이든 밀린 달은
  // 낮게·받은 달은 높게 나와 단월 비율이 거짓 경고가 되므로, 반대 방향으로 이탈한 인접 달과
  // 2개월 합산해 정상 범위면 '정산 이월'로 판정해 문구를 바꾼다(2026-08-20 대표 승인 규칙 확장).
  if (isMonth) {
    // 판정 축 — 스탭밀: 보정 정산률(식권 전월 귀속) / 가든: 원식 정산률(보정 축 없음)
    const judgeRate = hasMealTicket ? rateAdj : rate;
    const judgeAmt = hasMealTicket ? adjusted : inTotal;
    const rateLabel = hasMealTicket ? '보정 정산률' : '정산률';
    const lagLabel = hasMealTicket ? '식권 정산이 한 달 밀려' : '월말 카드·간편결제 정산이 다음 달로 넘어가';
    const lagCaveat = hasMealTicket ? '식권 시차를 감안해도' : '카드 정산 시차를 감안해도';
    const pairRate = (a: string, b2: string): number | null => {
      const pp = (posTotalAmt[a] ?? 0) + (posTotalAmt[b2] ?? 0);
      if (pp <= 0) return null;
      return Math.round((((judgeAmt[a] ?? 0) + (judgeAmt[b2] ?? 0)) * 1000) / pp) / 10;
    };
    for (const b of buckets) {
      const r = judgeRate[b];
      if (r == null) continue;
      // 판정 보류 — 스탭밀: 최신 1~2개월(식권 정산·은행 자료 미도래) / 가든: 최신 1개월(카드 D+2·은행 자료)
      if (hasMealTicket ? b >= prevYm(latestYm) : b >= latestYm) continue;
      if (r >= RATE_OK_MIN && r <= RATE_OK_MAX) continue;
      const partner = [nextYm(b), prevYm(b)]
        .filter((n) => judgeRate[n] != null && (judgeRate[n]! - 100) * (r - 100) < 0)
        .map((n) => ({ n, pr: pairRate(b, n) }))
        .find((x) => x.pr != null && x.pr >= RATE_OK_MIN && x.pr <= RATE_OK_MAX);
      if (partner) {
        warnings.push({
          bucket: b,
          message: `${rateLabel} ${r}% — ${lagLabel} 인접 달과 합산 입금된 패턴이에요(${partner.n}와 2개월 합산 ${partner.pr}%로 정상 범위). 회수 문제는 아니에요.`,
        });
      } else {
        warnings.push({
          bucket: b,
          message:
            r > 100
              ? `${rateLabel} ${r}% — ${lagCaveat} 입금이 POS보다 많아요. POS 밖 매출이나 분류 오류 후보예요.`
              : `${rateLabel} ${r}% — ${lagCaveat} 입금이 부족해요. 은행 자료 누락이나 미정산 후보예요.`,
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
      key: 'pos_menu',
      label: '메뉴 매출',
      kind: 'pos',
      amounts: posAmt,
      hint: hasMealTicket
        ? '판매일 기준 일반 메뉴 매출(pos_sales). 자가 식권으로 먹은 식사는 POS에 안 찍혀 여기 없어요.'
        : '판매일 기준 POS 매출(pos_sales) — 토스 POS 실매출이에요.',
    },
    ...(Object.keys(giftAmt).length > 0
      ? [
          {
            key: 'gift',
            label: '식권 판매',
            kind: 'pos' as const,
            amounts: giftAmt,
            hint: '자가 식권(식권 10장 등) 판매 — 사용 시점엔 POS에 안 찍으므로(매니저 확인) 판매 시점을 매출로 인식해요. 언제 식권이 잘 팔렸는지 이 열로 봐요.',
          },
        ]
      : []),
    {
      key: 'pos',
      label: 'POS 매출 합계 (정본)',
      kind: 'total',
      amounts: posTotalAmt,
      hint: hasMealTicket
        ? '메뉴 매출 + 식권 판매 = 페이히어 실매출과 일치. 월 성과 평가·관리손익·결산의 정본이에요.'
        : '토스 POS 실매출과 일치. 월 성과 평가·관리손익·결산의 정본이에요.',
    },
    ...incomeColumns,
    ...(hasMealTicket
      ? [
          {
            key: 'meal_ticket',
            label: '식권 정산 (전월분)',
            kind: 'income' as const,
            cat: '기타매출',
            amounts: mealTicket,
            hint: '식권대장(현대벤디스)·올리브식권 정산 — 손님은 지난달에 결제했고 돈이 이번 달 중순에 들어온 거예요. 이번 달 장사값이 아니에요.',
          },
        ]
      : []),
    {
      key: 'in_total',
      label: '통장 입금 합계',
      kind: 'total',
      amounts: inTotal,
      hint: '매출 계정으로 분류된 통장 입금의 순액(환불 차감) — 현금흐름 그대로.',
    },
    ...(Object.keys(unclassifiedAmt).length > 0
      ? [
          {
            key: 'in_unclassified',
            label: '미분류 입금 (참고)',
            kind: 'note' as const,
            amounts: unclassifiedAmt,
            hint: '아직 계정이 없는 입금 — 입금 합계·정산률에 안 들어가요. 매출 입금이 섞여 있으면 분류한 만큼 정산률이 올라가요.',
          },
        ]
      : []),
    {
      key: 'rate',
      label: '정산률 %',
      kind: 'derived',
      amounts: rate,
      hint: hasMealTicket
        ? '당월 입금 ÷ 당월 POS — 식권·카드 시차 때문에 매출 증감기에 크게 널뛰어요. 참고용.'
        : `당월 입금 ÷ 당월 POS — 회수가 정상인지는 이걸 봐요. 카드 매입(D+1~2)·간편결제 정산 시차로 월말 며칠치가 다음 달로 넘어가 ${RATE_OK_MIN}~${RATE_OK_MAX}% 안이면 정상, 최신 달은 정산이 아직이라 낮게 나오는 게 정상이에요.`,
    },
    ...(isMonth && hasMealTicket
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
