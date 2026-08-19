// 전처리1 — 지출 총합 (2026-08-19).
//
// 로우데이터(원본 행) 다음 단계. 소스별 지출을 월 단위로 모으되, **중복 제거를 계산식으로
// 드러낸다**. 집계 결과만 보여주면 이중계상이 숫자 뒤에 숨어버리기 때문 — 실제로 스탭밀에서
// 네이버페이·쿠팡 결제가 비씨카드로 나가는데 카드대금과 수집분을 둘 다 지출로 잡아
// 원가가 부풀어 있었다(2026-08-19 발견).
//
// 규칙: 스탭밀 통장에서 쿠팡·네이버페이 직접출금은 18개월간 3건·20만원뿐이고 사실상 전량
// 카드 결제다. 그래서 카드대금 인출에서 그 달 수집분을 빼야 '카드로 쓴 나머지'가 남는다.

export type ExpenseRowKind = 'source' | 'deduction' | 'derived' | 'total' | 'note';

export interface ExpenseTx {
  ym: string;
  source: string | null;
  memo: string | null;
  amount_out: number;
  amount_in: number;
  category_id: number | null;
  /** 계정과목 성격 — cogs·sga 만 지출로 집계 */
  cat_type: string | null;
}

export interface ExpenseRow {
  key: string;
  label: string;
  kind: ExpenseRowKind;
  /** ym → 금액 */
  amounts: Record<string, number>;
  /** 표에 붙는 설명 */
  hint?: string;
}

export interface ExpensePrep {
  yms: string[];
  rows: ExpenseRow[];
  /** 월별 경고 — 규칙이 깨지는 달을 숨기지 않고 드러낸다 */
  warnings: { ym: string; message: string }[];
}

/**
 * 통장에서 카드사로 나가는 결제 대금. 스탭밀 실제 기재내용은
 * '비씨카드선결제' · 'BC바로카드' · '현대카드' 세 가지다(2026-08-19 원본 확인).
 * 카드사가 늘면 여기에 추가한다 — 놓치면 카드대금이 은행 직접지출로 새어 들어간다.
 */
export const CARD_PAYMENT_RE = /(비씨카드|BC바로카드|BC카드|현대카드|신한카드|삼성카드|국민카드|롯데카드|하나카드|우리카드)/;

/** 지출로 집계하는 계정 성격 — 매출·비영업·제외 계정은 뺀다 */
const EXPENSE_TYPES = new Set(['cogs', 'sga']);

const add = (m: Record<string, number>, ym: string, v: number) => {
  m[ym] = (m[ym] ?? 0) + v;
};

export function buildExpensePrep(txns: ExpenseTx[]): ExpensePrep {
  const bankDirect: Record<string, number> = {};
  const cardPayment: Record<string, number> = {};
  const naverpay: Record<string, number> = {};
  const coupang: Record<string, number> = {};
  const cardStatement: Record<string, number> = {};
  const unclassified: Record<string, number> = {};

  for (const t of txns) {
    // 환불(입금)은 원 비용 계정으로 분류돼 있으므로 순액(출금−입금)으로 집계한다.
    // 잡손익으로 빼지 않는 것이 규약(2026-08-17) — 그래야 그 달 실제 비용이 남는다.
    const net = (t.amount_out || 0) - (t.amount_in || 0);
    const isExpenseCat = t.cat_type != null && EXPENSE_TYPES.has(t.cat_type);

    if (t.category_id == null && (t.amount_out || 0) > 0) add(unclassified, t.ym, t.amount_out);

    switch (t.source) {
      case 'naverpay':
        add(naverpay, t.ym, net);
        break;
      case 'coupang':
        add(coupang, t.ym, net);
        break;
      case 'card':
        if (isExpenseCat) add(cardStatement, t.ym, net);
        break;
      default: {
        // 은행 — 카드대금 인출은 '무엇을 샀는지 모르는 덩어리'라 계정과 무관하게 따로 센다
        // (현재 재료비로 분류돼 있지만 실제로는 소모품·유류비 등이 섞여 있다)
        if (CARD_PAYMENT_RE.test(t.memo ?? '') && net > 0) add(cardPayment, t.ym, net);
        else if (isExpenseCat) add(bankDirect, t.ym, net);
      }
    }
  }

  const yms = Array.from(
    new Set([
      ...Object.keys(bankDirect),
      ...Object.keys(cardPayment),
      ...Object.keys(naverpay),
      ...Object.keys(coupang),
      ...Object.keys(cardStatement),
    ])
  ).sort((a, b) => b.localeCompare(a));

  // 카드 기타지출 = 카드대금 − 네이버페이 − 쿠팡. 음수면 규칙이 안 맞는 달이니 0으로 두고 경고.
  const cardOther: Record<string, number> = {};
  const warnings: { ym: string; message: string }[] = [];
  for (const ym of yms) {
    const pay = cardPayment[ym] ?? 0;
    const np = naverpay[ym] ?? 0;
    const cp = coupang[ym] ?? 0;
    const rest = pay - np - cp;
    cardOther[ym] = Math.max(0, rest);
    if (pay === 0 && np + cp > 0) {
      warnings.push({
        ym,
        message: '이 달 카드대금 인출이 없어요 — 은행 자료가 아직 안 올라왔다면 수집분이 통째로 지출로 잡혀요.',
      });
    } else if (rest < 0) {
      warnings.push({
        ym,
        message: `수집분이 카드대금보다 ${Math.abs(rest).toLocaleString()}원 커요 — 카드 결제일이 다음 달로 넘어간 몫일 수 있어요.`,
      });
    }
  }

  const total: Record<string, number> = {};
  for (const ym of yms) {
    total[ym] =
      (bankDirect[ym] ?? 0) + cardOther[ym] + (naverpay[ym] ?? 0) + (coupang[ym] ?? 0) + (cardStatement[ym] ?? 0);
  }

  const rows: ExpenseRow[] = [
    {
      key: 'bank',
      label: '은행 직접지출',
      kind: 'source',
      amounts: bankDirect,
      hint: '통장에서 바로 나간 지출(인건비·임대료·식자재 등). 카드대금은 제외.',
    },
    {
      key: 'card_payment',
      label: '카드대금 인출',
      kind: 'source',
      amounts: cardPayment,
      hint: '통장에서 카드사로 나간 결제 대금. 무엇을 샀는지는 이 줄만으로는 알 수 없어요.',
    },
    {
      key: 'minus_naverpay',
      label: '− 네이버페이 수집분',
      kind: 'deduction',
      amounts: naverpay,
      hint: '카드로 결제된 몫이라 카드대금에 이미 들어 있어요. 빼지 않으면 두 번 계산돼요.',
    },
    { key: 'minus_coupang', label: '− 쿠팡 수집분', kind: 'deduction', amounts: coupang },
    {
      key: 'card_other',
      label: '= 카드 기타지출',
      kind: 'derived',
      amounts: cardOther,
      hint: '카드로 썼지만 수집 데이터가 없는 몫. 명세를 올리면 계정별로 쪼갤 수 있어요.',
    },
    { key: 'naverpay', label: '네이버페이', kind: 'source', amounts: naverpay },
    { key: 'coupang', label: '쿠팡', kind: 'source', amounts: coupang },
    ...(Object.keys(cardStatement).length > 0
      ? [{ key: 'card_statement', label: '카드 명세', kind: 'source' as const, amounts: cardStatement }]
      : []),
    { key: 'total', label: '지출 합계', kind: 'total', amounts: total },
    {
      key: 'unclassified',
      label: '미분류 (참고)',
      kind: 'note',
      amounts: unclassified,
      hint: '아직 계정이 없는 출금이에요. 합계에 안 들어가니 이 금액이 크면 지출 총합이 실제보다 작아요.',
    },
  ];

  return { yms, rows, warnings };
}
