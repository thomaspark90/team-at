// 전처리4 — POS 메뉴별 판매 (2026-08-20).
//
// pos_items(일×카테고리×상품)를 기간 축으로 펼친다. 두 층위:
//  - 요약: 메뉴 묶음 — 'Staff (기본 / 매장)'·'Staff (기본 / 포장)'·'스태프 (STAFF) (Medium)' 을
//    전부 'Staff' 하나로. 옵션(매장/포장·사이즈)과 표기 차이(한/영)를 접는다.
//  - 상세: 상품 원문 그대로 — 옵션별 구성이 필요할 때.
//
// 정합: 메뉴별 합(pos_items)은 전처리3의 POS 매출(pos_sales)과 같아야 한다. 실제로는
// 두 표가 서로 다른 파일(상품별/요약)에서 적재돼 월 10~26만원씩 어긋나 있다(2026-08-20 기준,
// 원인 규명은 상품별 파일 재업로드 대기) — 그 차이를 숨기지 않고 '정합 차이' 열로 상시 보여준다.

import type { ExpenseGrain } from './prepExpense';

export interface ItemSaleRow {
  sale_date: string; // 'YYYY-MM-DD'
  category: string;
  product: string;
  option: string;
  qty: number;
  gross: number;
}

export interface PosDailyTotal {
  sale_date: string;
  gross: number;
}

export interface GiftSale {
  sale_date: string;
  qty: number;
  gross: number;
}

export type MenuMetric = 'gross' | 'qty';

export interface MenuColumn {
  key: string;
  label: string;
  kind: 'menu' | 'total' | 'derived';
  amounts: Record<string, number>;
  /** 매출 뷰에서 함께 보여줄 주문수 — 요약에 수량이 꼭 필요하다는 요구(2026-08-20) */
  qtyAmounts?: Record<string, number>;
  /** 상세 열의 원본 상품명(옵션 제외) — 메뉴 묶음 키는 라벨('상품 · 옵션')이 아니라 이걸로.
      라벨로 묶으면 옵션이 있는 토스 데이터에서 상품이 옵션 조합 수만큼 쪼개진다(2026-08-21 감사 P2-3). */
  product?: string;
  hint?: string;
}

export interface MenuPrep {
  grain: ExpenseGrain;
  buckets: string[];
  /** 요약(메뉴 묶음) 열 — 총액 큰 순 + 합계/정합 */
  summary: MenuColumn[];
  /** 상세(상품 원문) 열 — 총액 큰 순 */
  detail: MenuColumn[];
}

const add = (m: Record<string, number>, k: string, v: number) => {
  m[k] = (m[k] ?? 0) + v;
};

/** 기간 버킷 — 전처리1과 동일 규칙(주=월요일 시작) */
function bucketOf(ymd: string, grain: ExpenseGrain): string {
  if (grain === 'month') return ymd.slice(0, 7);
  if (grain === 'day') return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * 메뉴 묶음 키 — 상품명의 '(' 앞 토막을 취하고 표기 차이(한/영·대소문자)를 접는다.
 * 스탭밀 실측: 'Staff (기본 / 매장)'·'스태프 (STAFF) (Medium)'·'staff포장' 이 전부 Staff.
 * 별칭은 데이터에서 확인된 것만 — 과잉 병합(다른 메뉴를 하나로)이 누락보다 위험하다.
 */
const MENU_ALIASES: Record<string, string> = {
  staff: 'Staff',
  스태프: 'Staff',
  newbie: 'Newbie',
  뉴비: 'Newbie',
  boss: 'Boss',
  보스: 'Boss',
};

export function menuKeyOf(product: string): string {
  let head = product.split('(')[0].trim();
  if (!head) head = product.trim();
  // 'staff포장' 같은 붙임 표기 — 별칭 접두면 별칭으로
  const lower = head.toLowerCase();
  for (const [alias, canon] of Object.entries(MENU_ALIASES)) {
    if (lower === alias || lower.startsWith(alias)) return canon;
  }
  return head;
}

export function buildMenuPrep(
  items: ItemSaleRow[],
  posTotals: PosDailyTotal[],
  grain: ExpenseGrain,
  metric: MenuMetric,
  gifts: GiftSale[] = [] // 식권 판매(선수금) — 매출·정합 밖 참고 열(2026-08-20 대표 요청)
): MenuPrep {
  const perMenu = new Map<string, Record<string, number>>();
  const perProduct = new Map<string, Record<string, number>>();
  const productOf = new Map<string, string>(); // 상세 키('상품 · 옵션') → 원본 상품명
  const perMenuQty = new Map<string, Record<string, number>>();
  const perProductQty = new Map<string, Record<string, number>>();
  const itemsTotal: Record<string, number> = {}; // 정합 비교는 항상 금액(gross) 기준
  const itemsMetricTotal: Record<string, number> = {};

  for (const r of items) {
    const b = bucketOf(r.sale_date, grain);
    const v = metric === 'qty' ? r.qty : r.gross;
    const menu = menuKeyOf(r.product);
    const m1 = perMenu.get(menu) ?? {};
    add(m1, b, v);
    perMenu.set(menu, m1);
    const pKey = r.option ? `${r.product} · ${r.option}` : r.product;
    productOf.set(pKey, r.product);
    const m2 = perProduct.get(pKey) ?? {};
    add(m2, b, v);
    perProduct.set(pKey, m2);
    const q1 = perMenuQty.get(menu) ?? {};
    add(q1, b, r.qty);
    perMenuQty.set(menu, q1);
    const q2 = perProductQty.get(pKey) ?? {};
    add(q2, b, r.qty);
    perProductQty.set(pKey, q2);
    add(itemsTotal, b, r.gross);
    add(itemsMetricTotal, b, v);
  }

  const posAmt: Record<string, number> = {};
  for (const p of posTotals) add(posAmt, bucketOf(p.sale_date, grain), p.gross);
  const giftAmt: Record<string, number> = {};
  const giftQty: Record<string, number> = {};
  for (const g of gifts) {
    const b = bucketOf(g.sale_date, grain);
    add(giftAmt, b, g.gross);
    add(giftQty, b, g.qty);
  }

  // 식권도 버킷 유도에 포함 — 식권만 팔린 구간이 행째 사라지던 결함(전처리1의 2026-08-20
  // 미분류-행-소실과 같은 유형, 2026-08-21 감사에서 발견)
  const buckets = Array.from(
    new Set([...Object.keys(itemsTotal), ...Object.keys(posAmt), ...Object.keys(giftAmt)])
  ).sort((a, b) => b.localeCompare(a));

  const toColumns = (
    map: Map<string, Record<string, number>>,
    qtyMap: Map<string, Record<string, number>>
  ): MenuColumn[] =>
    Array.from(map.entries())
      .map(([label, amounts]) => ({
        key: `m:${label}`,
        label,
        kind: 'menu' as const,
        amounts,
        // 매출 뷰에서 수량을 병기 — 수량 뷰에선 amounts 자체가 수량이라 생략
        qtyAmounts: metric === 'gross' ? qtyMap.get(label) : undefined,
        product: productOf.get(label) ?? label, // 요약(perMenu) 열은 라벨 자체가 메뉴 키
        _sum: Object.values(amounts).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b._sum - a._sum)
      .map(({ _sum, ...c }) => c);

  // 정합 차이 — 품목 합(금액)과 pos_sales 총액. metric 이 수량이어도 정합은 금액으로 따진다.
  const diff: Record<string, number> = {};
  for (const b of buckets) diff[b] = (itemsTotal[b] ?? 0) - (posAmt[b] ?? 0);

  const totalCol: MenuColumn = {
    key: 'total',
    label: metric === 'qty' ? '판매 수량 합계' : '메뉴 매출 합계',
    kind: 'total',
    amounts: itemsMetricTotal,
    hint:
      metric === 'qty'
        ? '품목 리포트(pos_items)의 수량 합이에요.'
        : '품목 리포트(pos_items)의 매출 합 — 아래 정합 차이가 0이어야 전처리3 POS 매출과 맞는 거예요.',
  };
  const posCol: MenuColumn = {
    key: 'pos_total',
    label: '메뉴 매출 (전처리3)',
    kind: 'derived',
    amounts: posAmt,
    // '정본'이라 부르지 않는다 — 정본(POS 매출 합계)은 메뉴 매출 + 식권 판매(2026-08-21 감사 P2-4).
    hint: "전처리3의 '메뉴 매출' 열(pos_sales)과 같은 값이에요. 정본(POS 매출 합계)은 여기에 식권 판매를 더한 것.",
  };
  const diffCol: MenuColumn = {
    key: 'diff',
    label: '정합 차이',
    kind: 'derived',
    amounts: diff,
    hint: '품목 합 − POS 매출. 0이 아니면 두 원천(상품별/요약 파일)이 어긋난 것 — 상품별 파일을 재업로드하면 그 달 기준으로 다시 맞춰져요.',
  };

  // 식권 판매 — 품목 리포트 밖이라 합계·정합 차이에 안 들어가는 참고 열. 페이히어 대시보드의
  // 실매출 = 메뉴 매출 합계 + 이 열 이라, 대시보드 숫자와의 대조가 화면에서 바로 된다.
  const giftCol: MenuColumn | null =
    Object.keys(giftAmt).length > 0
      ? {
          key: 'gift',
          label: '식권 판매 (참고)',
          kind: 'derived',
          amounts: metric === 'qty' ? giftQty : giftAmt,
          qtyAmounts: metric === 'gross' ? giftQty : undefined,
          // 회계 기준(2026-08-20 대표·매니저 확정): 자가 식권은 판매 시점 매출 인식 — 사용할 때는
          // POS에 아예 안 찍힌다. 옛 '아직 매출 아님' 문구는 개정 전 기준이라 정정(2026-08-21).
          hint: '자가 식권 판매 — 판매한 날 매출로 인식해요(사용 시점엔 POS에 안 찍힘). 품목 리포트 밖이라 합계·정합 차이에는 안 들어가요. 페이히어 실매출 = 메뉴 매출 합계 + 이 열.',
        }
      : null;
  const tail = [
    ...(metric === 'qty' ? [totalCol] : [totalCol, posCol, diffCol]),
    ...(giftCol ? [giftCol] : []),
  ];

  return {
    grain,
    buckets,
    summary: [...toColumns(perMenu, perMenuQty), ...tail],
    detail: [...toColumns(perProduct, perProductQty), totalCol, ...(giftCol ? [giftCol] : [])],
  };
}
