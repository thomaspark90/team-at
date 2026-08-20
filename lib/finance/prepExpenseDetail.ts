// 전처리2 — 지출 세분화 (2026-08-20).
//
// 전처리1(지출 총합)이 '소스별'로 모았다면, 여기는 같은 지출을 '계정과목별'로 펼친다.
// 하위 계정(정규직·단기 등)은 최상위 부모(인건비)로 합산해 열 수를 다스린다.
//
// 정합 원칙: **기간별 합계가 전처리1과 정확히 일치해야 한다.** 두 화면이 같은 돈을 다른
// 각도로 자른 것뿐이라, 합이 다르면 어느 한쪽이 거짓말을 하는 것이다. 그래서 중복 제거
// 규칙(카드대금 − 수집분)·미분류/미상 포함·대사 완료 제외를 전처리1과 똑같이 적용한다.
//
// 카드대금 잔여(수집분을 빼고 남은 몫)는 계정을 모르는 덩어리라 '카드 기타(미분해)' 열로
// 남는다 — 카드 명세를 올려 분류하면 이 열이 비고 실제 계정 열들로 옮겨간다.

import {
  CARD_PAYMENT_RE,
  bucketOf,
  type ExpenseGrain,
  type ExpenseTx,
} from './prepExpense';

export interface CategoryInfo {
  id: number;
  name: string;
  type: string;
  parent_id: number | null;
}

export interface DetailColumn {
  key: string; // 'cat:63' | 'card_other' | 'collected_other' | 'unclassified' | 'misang' | 'total'
  label: string;
  kind: 'category' | 'derived' | 'note' | 'total';
  /** 분류 화면 드릴다운용 — category 열이면 { type, cat } */
  filter?: { type: string; cat: string };
  amounts: Record<string, number>;
  hint?: string;
}

export interface ExpenseDetail {
  grain: ExpenseGrain;
  buckets: string[];
  columns: DetailColumn[];
  warnings: { bucket: string; message: string }[];
}

const EXPENSE_TYPES = new Set(['cogs', 'sga']);
const add = (m: Record<string, number>, k: string, v: number) => {
  m[k] = (m[k] ?? 0) + v;
};

export function buildExpenseDetail(
  txns: ExpenseTx[],
  cats: CategoryInfo[],
  grain: ExpenseGrain = 'month'
): ExpenseDetail {
  const isMonth = grain === 'month';
  const byId = new Map(cats.map((c) => [c.id, c]));

  // 하위 계정 → 최상위 부모로 합산(정규직·단기 → 인건비). 순환은 없다는 전제, 방어로 8단 제한.
  const topOf = (id: number): CategoryInfo | null => {
    let c = byId.get(id) ?? null;
    for (let i = 0; c?.parent_id != null && i < 8; i++) c = byId.get(c.parent_id) ?? c;
    return c;
  };

  const perCat = new Map<number, Record<string, number>>(); // 최상위 계정 id → 기간별 금액
  const cardPayment: Record<string, number> = {};
  const collectedAll: Record<string, number> = {}; // 수집분 전액 — 월 뷰 차감용(전처리1과 동일)
  const collectedOther: Record<string, number> = {}; // 수집분 중 비용 외(설비·개인·잡손익 등, 미상 제외)
  const unclassified: Record<string, number> = {};
  const misang: Record<string, number> = {};
  const settledCard: Record<string, number> = {};

  for (const t of txns) {
    const b = bucketOf(t, grain);
    const net = (t.amount_out || 0) - (t.amount_in || 0);
    const cat = t.category_id != null ? byId.get(t.category_id) : null;
    const isCollected = t.source === 'naverpay' || t.source === 'coupang';
    const isMisang = cat?.name === '미상';

    if (isCollected) {
      add(collectedAll, b, net);
      if (t.category_id == null) add(unclassified, b, net); // 수집분 미분류 — 순액(합계 정합)
      else if (isMisang) add(misang, b, net);
      else if (cat && EXPENSE_TYPES.has(cat.type)) {
        const top = topOf(cat.id)!;
        const m = perCat.get(top.id) ?? {};
        add(m, b, net);
        perCat.set(top.id, m);
      } else add(collectedOther, b, net); // 설비·개인·잡손익 등 — 합계엔 포함(전처리1 정합)
      continue;
    }

    if (t.source === 'card') {
      if (cat && EXPENSE_TYPES.has(cat.type)) {
        const top = topOf(cat.id)!;
        const m = perCat.get(top.id) ?? {};
        add(m, b, net);
        perCat.set(top.id, m);
      } else if (isMisang) add(misang, b, net);
      else if (t.category_id == null && (t.amount_out || 0) > 0) add(unclassified, b, t.amount_out);
      continue;
    }

    // 은행 — 전처리1과 동일 규칙
    if (CARD_PAYMENT_RE.test(t.memo ?? '') && net > 0 && cat?.name !== '건별분할') {
      if (cat?.name === '카드대금정산') add(settledCard, b, net);
      else add(cardPayment, b, net);
      continue;
    }
    if (t.category_id == null) {
      if ((t.amount_out || 0) > 0) add(unclassified, b, t.amount_out); // 은행 미분류는 총액(전처리1·관리손익 동일)
      continue;
    }
    if (isMisang) {
      add(misang, b, net);
      continue;
    }
    if (cat && EXPENSE_TYPES.has(cat.type)) {
      const top = topOf(cat.id)!;
      const m = perCat.get(top.id) ?? {};
      add(m, b, net);
      perCat.set(top.id, m);
    }
    // 그 외(매출·비영업·excluded)는 지출 화면 밖 — 전처리1과 동일하게 제외
  }

  const buckets = Array.from(
    new Set([
      ...Array.from(perCat.values()).flatMap((m) => Object.keys(m)),
      ...Object.keys(cardPayment),
      ...Object.keys(collectedAll),
      ...Object.keys(unclassified),
      ...Object.keys(misang),
      ...Object.keys(collectedOther),
    ])
  ).sort((a, b) => b.localeCompare(a));

  // 카드 기타(미분해) — 월 뷰는 수집분 차감, 일·주 뷰는 덩어리 그대로(전처리1과 동일)
  const cardOther: Record<string, number> = {};
  const warnings: { bucket: string; message: string }[] = [];
  for (const b of buckets) {
    const pay = cardPayment[b] ?? 0;
    if (!isMonth) {
      cardOther[b] = pay;
      continue;
    }
    const rest = pay - (collectedAll[b] ?? 0);
    cardOther[b] = Math.max(0, rest);
    if (pay === 0 && (collectedAll[b] ?? 0) > 0 && !(settledCard[b] ?? 0)) {
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

  // 열 구성 — cogs 먼저, 그 다음 sga, 각각 총액 큰 순. 금액이 전혀 없는 계정은 열을 만들지 않는다.
  const catColumns: DetailColumn[] = Array.from(perCat.entries())
    .map(([id, amounts]) => {
      const c = byId.get(id)!;
      return {
        key: `cat:${id}`,
        label: c.name,
        kind: 'category' as const,
        filter: { type: c.type, cat: c.name },
        amounts,
        _type: c.type,
        _sum: Object.values(amounts).reduce((s, v) => s + v, 0),
      };
    })
    .sort((a, b) => (a._type === b._type ? b._sum - a._sum : a._type === 'cogs' ? -1 : 1))
    .map(({ _type, _sum, ...col }) => col);

  const total: Record<string, number> = {};
  for (const b of buckets) {
    total[b] =
      catColumns.reduce((s, c) => s + (c.amounts[b] ?? 0), 0) +
      (cardOther[b] ?? 0) +
      (collectedOther[b] ?? 0) +
      (unclassified[b] ?? 0) +
      (misang[b] ?? 0);
  }

  const columns: DetailColumn[] = [
    ...catColumns,
    {
      key: 'card_other',
      label: isMonth ? '카드 기타(미분해)' : '카드대금(미분해)',
      kind: 'derived',
      amounts: cardOther,
      hint: isMonth
        ? '카드대금에서 수집분을 뺀, 계정을 모르는 몫이에요. 카드 명세를 올려 분류하면 이 열이 비고 실제 계정 열로 옮겨가요.'
        : '결제일에 목돈으로 나간 카드대금이에요. 이 안에 수집분(각 계정 열)이 겹쳐 있어요.',
    },
    {
      key: 'collected_other',
      label: '기타(비용 외)',
      kind: 'note',
      amounts: collectedOther,
      hint: '수집분 중 설비·개인·잡손익 등 비용이 아닌 계정으로 분류된 몫 — 카드대금 차감 정합을 위해 합계에 포함해요.',
    },
    {
      key: 'unclassified',
      label: '미분류',
      kind: 'note',
      amounts: unclassified,
      hint: '아직 계정이 없는 지출 — 분류하면 실제 계정 열로 옮겨가요. 관리손익과 같은 규칙으로 합계에 포함해요.',
    },
    {
      key: 'misang',
      label: '미상',
      kind: 'note',
      amounts: misang,
      hint: "용도를 판단하지 못해 '미상'으로 보류한 지출 — 이익이 부풀지 않게 합계에 포함해요.",
    },
    {
      key: 'total',
      label: isMonth ? '지출 합계 (비용)' : '현금 유출 합계',
      kind: 'total',
      amounts: total,
      hint: '전처리1의 합계와 정확히 같아야 해요 — 같은 돈을 계정 축으로 다시 자른 것뿐이라서요.',
    },
  ];

  return { grain, buckets, columns, warnings };
}
