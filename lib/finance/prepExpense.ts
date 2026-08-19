// 전처리1 — 지출 총합 (2026-08-19, 일/주 뷰 추가 2026-08-20).
//
// 로우데이터(원본 행) 다음 단계. 소스별 지출을 기간 단위로 모으되, **중복 제거를 계산식으로
// 드러낸다**. 집계 결과만 보여주면 이중계상이 숫자 뒤에 숨어버리기 때문 — 실제로 스탭밀에서
// 네이버페이·쿠팡 결제가 비씨카드로 나가는데 카드대금과 수집분을 둘 다 지출로 잡아
// 원가가 부풀어 있었다(2026-08-19 발견).
//
// 기간 단위에 따라 표의 **성격이 다르다**(2026-08-20 대표 확인):
//  - 월: '비용' 관점. 카드대금에서 그 달 수집분을 빼 실제 비용을 남긴다.
//  - 일·주: '현금흐름' 관점. 카드대금은 결제일에 목돈으로 나가고 그 안의 네이버페이 건은
//    사용일에 흩어져 있어 같은 칸에서 뺄 수가 없다. 그래서 차감하지 않고 '미분해 덩어리'로 둔다.
//
// 이 구분은 한시적이다. 카드명세를 올려 분류하면 덩어리가 개별 건(사용일·계정 특정)으로 풀리고,
// 그때 일·주 숫자가 저절로 정확해지면서 두 관점이 일치한다.

export type ExpenseRowKind = 'source' | 'deduction' | 'derived' | 'total' | 'note';
export type ExpenseGrain = 'day' | 'week' | 'month';

export interface ExpenseTx {
  /** 거래 일시(ISO) — 일·주 구간 산출용 */
  tx_at: string;
  ym: string;
  source: string | null;
  memo: string | null;
  amount_out: number;
  amount_in: number;
  category_id: number | null;
  /** 계정과목 성격 — cogs·sga 만 지출로 집계 */
  cat_type: string | null;
  /** 계정과목 이름 — '카드대금정산'(대사 완료 표식) 판별용 */
  cat_name: string | null;
}

export interface ExpenseRow {
  key: string;
  label: string;
  kind: ExpenseRowKind;
  /** 구간 키(월 'YYYY-MM' · 주 'YYYY-MM-DD(월요일)' · 일 'YYYY-MM-DD') → 금액 */
  amounts: Record<string, number>;
  /** 표에 붙는 설명 */
  hint?: string;
}

export interface ExpensePrep {
  grain: ExpenseGrain;
  /** 최신 구간이 앞 */
  buckets: string[];
  rows: ExpenseRow[];
  /** 구간별 경고 — 규칙이 깨지는 칸을 숨기지 않고 드러낸다 */
  warnings: { bucket: string; message: string }[];
}

/**
 * 통장에서 카드사로 나가는 결제 대금. 스탭밀 실제 기재내용은
 * '비씨카드선결제' · 'BC바로카드' · '현대카드' 세 가지다(2026-08-19 원본 확인).
 * 카드사가 늘면 여기에 추가한다 — 놓치면 카드대금이 은행 직접지출로 새어 들어간다.
 */
export const CARD_PAYMENT_RE =
  /(비씨카드|BC바로카드|BC카드|현대카드|신한카드|삼성카드|국민카드|롯데카드|하나카드|우리카드)/;

/** 지출로 집계하는 계정 성격 — 매출·비영업·제외 계정은 뺀다 */
const EXPENSE_TYPES = new Set(['cogs', 'sga']);

/**
 * 카드 명세와 대사가 끝난 인출인가. 대사되면 CardReconcile 이 그 인출을 '카드대금정산'
 * (type=excluded)으로 바꾸고, 실제 사용 건들이 source='card' 로 들어온다. 그때부터 이 인출은
 * 덩어리가 아니라 '이미 분해된 것'이라 지출에서 빠져야 한다.
 */
const SETTLED_CARD_CAT = '카드대금정산';
const isSettledCard = (t: ExpenseTx) => t.cat_type === 'excluded' && t.cat_name === SETTLED_CARD_CAT;

const add = (m: Record<string, number>, k: string, v: number) => {
  m[k] = (m[k] ?? 0) + v;
};

/** 거래를 구간 키로 — 주는 그 주 월요일 날짜로 묶는다(ISO 주 시작) */
export function bucketOf(tx: ExpenseTx, grain: ExpenseGrain): string {
  if (grain === 'month') return tx.ym;
  const date = tx.tx_at.slice(0, 10);
  if (grain === 'day') return date;
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=일요일
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7)); // 월요일로 되감기
  return d.toISOString().slice(0, 10);
}

export function buildExpensePrep(txns: ExpenseTx[], grain: ExpenseGrain = 'month'): ExpensePrep {
  const isMonth = grain === 'month';

  const bankDirect: Record<string, number> = {};
  const cardPayment: Record<string, number> = {};
  const naverpay: Record<string, number> = {};
  const coupang: Record<string, number> = {};
  const cardStatement: Record<string, number> = {};
  const unclassified: Record<string, number> = {};
  // 명세와 대사가 끝난 카드대금 — 지출에는 안 넣지만, '카드대금이 없는 달' 경고를 걸러내는 데 쓴다
  const settledCard: Record<string, number> = {};

  for (const t of txns) {
    const b = bucketOf(t, grain);
    // 환불(입금)은 원 비용 계정으로 분류돼 있으므로 순액(출금−입금)으로 집계한다.
    // 잡손익으로 빼지 않는 것이 규약(2026-08-17) — 그래야 그 구간 실제 비용이 남는다.
    const net = (t.amount_out || 0) - (t.amount_in || 0);
    const isExpenseCat = t.cat_type != null && EXPENSE_TYPES.has(t.cat_type);

    if (t.category_id == null && (t.amount_out || 0) > 0) add(unclassified, b, t.amount_out);

    switch (t.source) {
      case 'naverpay':
        add(naverpay, b, net);
        break;
      case 'coupang':
        add(coupang, b, net);
        break;
      case 'card':
        if (isExpenseCat) add(cardStatement, b, net);
        break;
      default: {
        // 은행 — 카드대금 인출은 '무엇을 샀는지 모르는 덩어리'라 계정과 무관하게 따로 센다
        // (현재 재료비로 분류돼 있지만 실제로는 소모품·유류비 등이 섞여 있다).
        //
        // 단 이미 명세와 대사된 인출은 제외한다. 대사가 끝나면 그 인출은 '카드대금정산'
        // (type=excluded)으로 바뀌고 실제 사용 건들이 source='card' 로 따로 들어오기 때문 —
        // 여기서 덩어리로 또 세면 명세 줄과 겹쳐 이중계상이 된다.
        if (CARD_PAYMENT_RE.test(t.memo ?? '') && net > 0) {
          if (isSettledCard(t)) add(settledCard, b, net);
          else add(cardPayment, b, net);
        } else if (isExpenseCat) add(bankDirect, b, net);
      }
    }
  }

  const buckets = Array.from(
    new Set([
      ...Object.keys(bankDirect),
      ...Object.keys(cardPayment),
      ...Object.keys(naverpay),
      ...Object.keys(coupang),
      ...Object.keys(cardStatement),
    ])
  ).sort((a, b) => b.localeCompare(a));

  // 월 뷰에서만 차감한다 — 일·주는 결제일과 사용일이 어긋나 같은 칸에서 뺄 수 없다.
  const cardOther: Record<string, number> = {};
  const warnings: { bucket: string; message: string }[] = [];
  for (const b of buckets) {
    const pay = cardPayment[b] ?? 0;
    if (!isMonth) {
      cardOther[b] = pay; // 차감 없이 덩어리 그대로
      continue;
    }
    const np = naverpay[b] ?? 0;
    const cp = coupang[b] ?? 0;
    const rest = pay - np - cp;
    cardOther[b] = Math.max(0, rest);
    // 대사가 끝난 달은 카드대금이 0 이어도 정상 — 명세가 그 자리를 대신한다
    if (pay === 0 && np + cp > 0 && !(settledCard[b] ?? 0)) {
      warnings.push({
        bucket: b,
        message: '이 달 카드대금 인출이 없어요 — 은행 자료가 아직 안 올라왔다면 수집분이 통째로 지출로 잡혀요.',
      });
    } else if (rest < 0) {
      warnings.push({
        bucket: b,
        message: `수집분이 카드대금보다 ${Math.abs(rest).toLocaleString()}원 커요 — 카드 결제일이 다음 달로 넘어간 몫일 수 있어요.`,
      });
    }
  }

  const total: Record<string, number> = {};
  for (const b of buckets) {
    total[b] =
      (bankDirect[b] ?? 0) + (cardOther[b] ?? 0) + (naverpay[b] ?? 0) + (coupang[b] ?? 0) + (cardStatement[b] ?? 0);
  }

  const rows: ExpenseRow[] = [
    {
      key: 'bank',
      label: '은행 직접지출',
      kind: 'source',
      amounts: bankDirect,
      hint: '통장에서 바로 나간 지출(인건비·임대료·식자재 등). 카드대금은 제외.',
    },
    ...(isMonth
      ? [
          {
            key: 'card_payment',
            label: '카드대금 인출',
            kind: 'source' as const,
            amounts: cardPayment,
            hint: '통장에서 카드사로 나간 결제 대금. 무엇을 샀는지는 이 줄만으로는 알 수 없어요.',
          },
          {
            key: 'minus_naverpay',
            label: '− 네이버페이 수집분',
            kind: 'deduction' as const,
            amounts: naverpay,
            hint: '카드로 결제된 몫이라 카드대금에 이미 들어 있어요. 빼지 않으면 두 번 계산돼요.',
          },
          { key: 'minus_coupang', label: '− 쿠팡 수집분', kind: 'deduction' as const, amounts: coupang },
          {
            key: 'card_other',
            label: '= 카드 기타지출',
            kind: 'derived' as const,
            amounts: cardOther,
            hint: '카드로 썼지만 수집 데이터가 없는 몫. 명세를 올리면 계정별로 쪼갤 수 있어요.',
          },
        ]
      : [
          {
            key: 'card_other',
            label: '카드대금 (미분해)',
            kind: 'source' as const,
            amounts: cardOther,
            hint: '결제일에 목돈으로 빠진 카드대금이에요. 이 안에 아래 네이버페이·쿠팡 건들이 들어 있어서 그만큼 겹쳐요 — 카드명세를 올려 분류하면 사용일별로 풀려요.',
          },
        ]),
    { key: 'naverpay', label: '네이버페이', kind: 'source', amounts: naverpay },
    { key: 'coupang', label: '쿠팡', kind: 'source', amounts: coupang },
    ...(Object.keys(cardStatement).length > 0
      ? [{ key: 'card_statement', label: '카드 명세', kind: 'source' as const, amounts: cardStatement }]
      : []),
    {
      key: 'total',
      label: isMonth ? '지출 합계 (비용)' : '현금 유출 합계',
      kind: 'total',
      amounts: total,
      hint: isMonth
        ? '카드대금에서 수집분을 뺀 실제 비용이에요.'
        : '통장·카드에서 실제로 나간 돈이에요. 카드대금 덩어리와 그 안의 수집분이 겹쳐 있어 비용보다 커요.',
    },
    {
      key: 'unclassified',
      label: '미분류 (참고)',
      kind: 'note',
      amounts: unclassified,
      hint: '아직 계정이 없는 출금이에요. 합계에 안 들어가니 이 금액이 크면 지출 총합이 실제보다 작아요.',
    },
  ];

  return { grain, buckets, rows, warnings };
}
