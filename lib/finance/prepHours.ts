// 전처리5 — 시간대별 판매 (2026-08-26).
//
// pos_item_hours(영업일 × 시각 × 상품)를 세 축으로 펼친다:
//   ① 시간대별 — 몇 시에 몇 접시 나가고 그때 평균 몇 그램인가(피크 파악·인력 배치)
//   ② 기간 추이 — 일/주/월별 판매 건수·평균 그램·매출
//   ③ 요일별 — 요일 편차
//
// 그램은 '정가(list_price) ÷ 그램당 단가'로 역산한다 — 근거와 단가표는 gramProducts.ts.
// 그램 규칙이 없는 상품은 grams/avgGram 이 null 이고 화면에서 그램 열이 빠진다.

import type { ExpenseGrain } from './prepExpense';
import { gramRuleFor, type GramProductRule } from './gramProducts';

export interface HourSale {
  sale_date: string; // 'YYYY-MM-DD'
  hour: number; // 0~23
  category: string;
  product: string;
  option: string;
  qty: number;
  orders: number;
  list_price: number;
  gross: number;
}

export interface HourStat {
  hour: number;
  qty: number; // 판매 건수(접시 수) — 취소는 음수로 net
  orders: number; // 주문 수(버킷 안 고유 주문번호 합)
  gross: number; // 실판매금액(VAT 포함)
  grams: number | null;
  avgGram: number | null; // grams ÷ qty
  perDay: number; // 영업일 하루 평균 판매 건수
  share: number; // 전체 판매 건수 중 비중(0~1)
}

export interface TrendRow {
  bucket: string;
  qty: number;
  orders: number;
  gross: number;
  grams: number | null;
  avgGram: number | null;
  avgPrice: number | null; // 건당 실판매금액
  firstHour: number | null;
  lastHour: number | null;
  days: number; // 이 구간의 영업일 수
}

export interface ProductOption {
  product: string;
  category: string;
  qty: number;
  gross: number;
  gram: boolean; // 그램 단위 판매 상품인가
  firstDate: string;
  lastDate: string;
}

export interface HoursPrep {
  hours: HourStat[];
  trend: TrendRow[];
  dow: TrendRow[];
  totals: { qty: number; orders: number; gross: number; grams: number | null; avgGram: number | null; days: number };
  rule: GramProductRule | null; // 마지막 영업일 기준 적용 단가(화면 표기용)
  range: { from: string; to: string } | null;
}

const DOW_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

/** 기간 버킷 — 전처리1·4와 같은 규칙(주 = 그 주 월요일) */
export function bucketOfDate(ymd: string, grain: ExpenseGrain): string {
  if (grain === 'month') return ymd.slice(0, 7);
  if (grain === 'day') return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** 월요일=0 인 요일 인덱스 */
export const dowIndex = (ymd: string): number => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
export const dowLabel = (ymd: string): string => DOW_LABELS[dowIndex(ymd)];

/** 상품 선택기 목록 — 판매 건수 큰 순 */
export function productOptions(rows: HourSale[], brand: string, store: string): ProductOption[] {
  const m = new Map<string, ProductOption>();
  for (const r of rows) {
    const c =
      m.get(r.product) ??
      {
        product: r.product,
        category: r.category,
        qty: 0,
        gross: 0,
        gram: !!gramRuleFor(brand, store, r.product, r.sale_date),
        firstDate: r.sale_date,
        lastDate: r.sale_date,
      };
    c.qty += Number(r.qty);
    c.gross += Number(r.gross);
    c.gram = c.gram || !!gramRuleFor(brand, store, r.product, r.sale_date);
    if (r.sale_date < c.firstDate) c.firstDate = r.sale_date;
    if (r.sale_date > c.lastDate) c.lastDate = r.sale_date;
    m.set(r.product, c);
  }
  return Array.from(m.values()).sort((a, b) => b.qty - a.qty);
}

interface Acc {
  qty: number;
  orders: number;
  gross: number;
  grams: number;
  hasGram: boolean;
  days: Set<string>;
  firstHour: number | null;
  lastHour: number | null;
}
const emptyAcc = (): Acc => ({ qty: 0, orders: 0, gross: 0, grams: 0, hasGram: false, days: new Set(), firstHour: null, lastHour: null });

const avg = (num: number, den: number): number | null => (den > 0 ? num / den : null);

function toTrendRow(bucket: string, a: Acc): TrendRow {
  return {
    bucket,
    qty: a.qty,
    orders: a.orders,
    gross: a.gross,
    grams: a.hasGram ? a.grams : null,
    avgGram: a.hasGram ? avg(a.grams, a.qty) : null,
    avgPrice: avg(a.gross, a.qty),
    firstHour: a.firstHour,
    lastHour: a.lastHour,
    days: a.days.size,
  };
}

/**
 * @param rows  이미 (브랜드·지점·기간·상품)으로 걸러진 pos_item_hours 행
 * @param brand·store 그램 단가 규칙 판정용
 */
export function buildHoursPrep(
  rows: HourSale[],
  brand: string,
  store: string,
  grain: ExpenseGrain = 'day',
): HoursPrep {
  const byHour = new Map<number, Acc>();
  const byBucket = new Map<string, Acc>();
  const byDow = new Map<number, Acc>();
  const all = emptyAcc();

  for (const r of rows) {
    const qty = Number(r.qty);
    const gross = Number(r.gross);
    const rule = gramRuleFor(brand, store, r.product, r.sale_date);
    const grams = rule ? Number(r.list_price) / rule.wonPerGram : 0;
    const orders = Number(r.orders ?? 0);

    for (const [map, key] of [
      [byHour, r.hour] as const,
      [byBucket, bucketOfDate(r.sale_date, grain)] as const,
      [byDow, dowIndex(r.sale_date)] as const,
    ]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = map as Map<any, Acc>;
      const a = m.get(key) ?? emptyAcc();
      a.qty += qty;
      a.orders += orders;
      a.gross += gross;
      a.grams += grams;
      a.hasGram = a.hasGram || !!rule;
      a.days.add(r.sale_date);
      a.firstHour = a.firstHour === null ? r.hour : Math.min(a.firstHour, r.hour);
      a.lastHour = a.lastHour === null ? r.hour : Math.max(a.lastHour, r.hour);
      m.set(key, a);
    }

    all.qty += qty;
    all.orders += orders;
    all.gross += gross;
    all.grams += grams;
    all.hasGram = all.hasGram || !!rule;
    all.days.add(r.sale_date);
  }

  const days = all.days.size;
  const hours: HourStat[] = Array.from(byHour.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, a]) => ({
      hour,
      qty: a.qty,
      orders: a.orders,
      gross: a.gross,
      grams: a.hasGram ? a.grams : null,
      avgGram: a.hasGram ? avg(a.grams, a.qty) : null,
      perDay: days > 0 ? a.qty / days : 0,
      share: all.qty !== 0 ? a.qty / all.qty : 0,
    }));

  const trend = Array.from(byBucket.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // 최신 구간 먼저
    .map(([b, a]) => toTrendRow(b, a));

  const dow = Array.from(byDow.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([i, a]) => toTrendRow(DOW_LABELS[i], a));

  const dates = Array.from(all.days).sort();
  const lastDate = dates[dates.length - 1] ?? '';
  const products = Array.from(new Set(rows.map((r) => r.product)));
  const rule = products.length === 1 && lastDate ? gramRuleFor(brand, store, products[0], lastDate) : null;

  return {
    hours,
    trend,
    dow,
    totals: {
      qty: all.qty,
      orders: all.orders,
      gross: all.gross,
      grams: all.hasGram ? all.grams : null,
      avgGram: all.hasGram ? avg(all.grams, all.qty) : null,
      days,
    },
    rule,
    range: dates.length ? { from: dates[0], to: lastDate } : null,
  };
}

// ── 매출 비중 (2026-08-26 대표 요청) ─────────────────────────────────────────
// 선택 상품이 그 지점 전체 POS 매출에서 몇 %인지. 분모(전체 매출)는 같은 테이블의 전 상품 합이고,
// 이 합은 pos_sales(전처리3 정본)와 4개월 수량·금액 완전 일치가 검증돼 있다.

export interface ShareRow {
  bucket: string;
  days: number; // 그 구간의 영업일 수(매장 기준)
  itemQty: number;
  itemGross: number;
  totalGross: number;
  share: number | null; // itemGross ÷ totalGross
  avgGram: number | null;
}

export interface ShareAverage {
  grain: ExpenseGrain;
  label: string; // '일 평균' · '주 평균' · '월 평균'
  buckets: number; // 평균을 낸 구간 수
  itemQty: number; // 구간당 평균 판매 건수
  itemGross: number; // 구간당 평균 상품 매출
  totalGross: number; // 구간당 평균 전체 매출
  share: number | null; // 가중 비중(합÷합) — 구간별 비중의 산술평균이 아니다
  avgGram: number | null;
}

export interface SharePrep {
  rows: ShareRow[]; // 최신 구간 먼저
  totals: ShareRow; // 전 구간 합(bucket='합계')
  averages: ShareAverage[]; // 일·주·월 — 상품이 팔린 구간만 대상
}

const AVG_GRAINS: { grain: ExpenseGrain; label: string }[] = [
  { grain: 'day', label: '일 평균' },
  { grain: 'week', label: '주 평균' },
  { grain: 'month', label: '월 평균' },
];

interface ShareAcc {
  itemQty: number;
  itemGross: number;
  itemGrams: number;
  hasGram: boolean;
  totalGross: number;
  days: Set<string>;
}
const emptyShare = (): ShareAcc => ({ itemQty: 0, itemGross: 0, itemGrams: 0, hasGram: false, totalGross: 0, days: new Set() });

function accumulate(map: Map<string, ShareAcc>, key: string, r: HourSale, isItem: boolean, brand: string, store: string) {
  const a = map.get(key) ?? emptyShare();
  a.totalGross += Number(r.gross);
  a.days.add(r.sale_date);
  if (isItem) {
    a.itemQty += Number(r.qty);
    a.itemGross += Number(r.gross);
    const rule = gramRuleFor(brand, store, r.product, r.sale_date);
    if (rule) {
      a.itemGrams += Number(r.list_price) / rule.wonPerGram;
      a.hasGram = true;
    }
  }
  map.set(key, a);
}

const toShareRow = (bucket: string, a: ShareAcc): ShareRow => ({
  bucket,
  days: a.days.size,
  itemQty: a.itemQty,
  itemGross: a.itemGross,
  totalGross: a.totalGross,
  share: a.totalGross > 0 ? a.itemGross / a.totalGross : null,
  avgGram: a.hasGram && a.itemQty > 0 ? a.itemGrams / a.itemQty : null,
});

/**
 * @param all     기간 안의 전 상품 행(분모)
 * @param product 비중을 볼 상품(분자)
 */
export function buildSharePrep(
  all: HourSale[],
  product: string,
  brand: string,
  store: string,
  grain: ExpenseGrain = 'day',
): SharePrep {
  const byBucket = new Map<string, ShareAcc>();
  const total = emptyShare();
  // 평균용 — 세 단위를 동시에 쌓는다(토글과 무관하게 일·주·월 평균을 함께 보여주려고)
  const byGrain: Record<ExpenseGrain, Map<string, ShareAcc>> = { day: new Map(), week: new Map(), month: new Map() };

  for (const r of all) {
    const isItem = r.product === product;
    accumulate(byBucket, bucketOfDate(r.sale_date, grain), r, isItem, brand, store);
    for (const g of AVG_GRAINS) accumulate(byGrain[g.grain], bucketOfDate(r.sale_date, g.grain), r, isItem, brand, store);
    total.totalGross += Number(r.gross);
    total.days.add(r.sale_date);
    if (isItem) {
      total.itemQty += Number(r.qty);
      total.itemGross += Number(r.gross);
      const rule = gramRuleFor(brand, store, r.product, r.sale_date);
      if (rule) {
        total.itemGrams += Number(r.list_price) / rule.wonPerGram;
        total.hasGram = true;
      }
    }
  }

  const rows = Array.from(byBucket.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([b, a]) => toShareRow(b, a));

  const averages: ShareAverage[] = AVG_GRAINS.map(({ grain: g, label }) => {
    // 상품이 안 팔린 구간(판매 개시 전 등)은 평균에서 뺀다 — 넣으면 평균이 근거 없이 희석된다
    const accs = Array.from(byGrain[g].values()).filter((a) => a.itemQty !== 0);
    const n = accs.length;
    const sum = accs.reduce(
      (s, a) => ({
        itemQty: s.itemQty + a.itemQty,
        itemGross: s.itemGross + a.itemGross,
        totalGross: s.totalGross + a.totalGross,
        itemGrams: s.itemGrams + a.itemGrams,
        hasGram: s.hasGram || a.hasGram,
      }),
      { itemQty: 0, itemGross: 0, totalGross: 0, itemGrams: 0, hasGram: false },
    );
    return {
      grain: g,
      label,
      buckets: n,
      itemQty: n ? sum.itemQty / n : 0,
      itemGross: n ? sum.itemGross / n : 0,
      totalGross: n ? sum.totalGross / n : 0,
      share: sum.totalGross > 0 ? sum.itemGross / sum.totalGross : null,
      avgGram: sum.hasGram && sum.itemQty > 0 ? sum.itemGrams / sum.itemQty : null,
    };
  });

  return { rows, totals: toShareRow('합계', total), averages };
}

// ── 구간 × 전 상품 비중 표 (2026-08-26 대표 요청) ──────────────────────────
// 전처리4(기간 × 상품 매출)와 같은 뼈대지만 값이 **비중**이다 — 브런치바가 다른 메뉴 대비
// 어느 정도인지 한 표에서 비교하려는 것. 열이 260개까지 가므로 상위 N + '기타'로 접고,
// 보고 있는 상품은 상위권 밖이어도 항상 첫 열에 고정한다.

export const OTHER_COL = '기타';

export interface GridCell {
  product: string;
  gross: number;
  qty: number;
  share: number; // 그 구간 매장 매출 대비
}
export interface GridRow {
  bucket: string;
  days: number;
  total: number; // 그 구간 매장 전체 매출
  cells: GridCell[]; // columns 와 같은 순서
}
export interface ProductGrid {
  columns: { product: string; gross: number; share: number }[]; // 전 구간 기준 — 마지막이 '기타'
  rows: GridRow[]; // 최신 구간 먼저
  totalRow: GridRow; // 전 구간 합(bucket='전체')
}

/**
 * @param top 상품 열 수(기타 제외). 기본 12
 * @param pin 항상 첫 열에 두는 상품(보고 있는 상품)
 */
export function buildProductShareGrid(
  all: HourSale[],
  grain: ExpenseGrain,
  opts: { top?: number; pin?: string } = {},
): ProductGrid {
  const top = opts.top ?? 12;
  const pin = opts.pin ?? '';

  const byProduct = new Map<string, number>();
  const bucketTotal = new Map<string, number>();
  const bucketDays = new Map<string, Set<string>>();
  const cell = new Map<string, { gross: number; qty: number }>(); // `${bucket}|${product}`
  let grand = 0;

  for (const r of all) {
    const b = bucketOfDate(r.sale_date, grain);
    const gross = Number(r.gross);
    const qty = Number(r.qty);
    byProduct.set(r.product, (byProduct.get(r.product) ?? 0) + gross);
    bucketTotal.set(b, (bucketTotal.get(b) ?? 0) + gross);
    if (!bucketDays.has(b)) bucketDays.set(b, new Set());
    bucketDays.get(b)!.add(r.sale_date);
    const k = `${b}|${r.product}`;
    const c = cell.get(k) ?? { gross: 0, qty: 0 };
    c.gross += gross;
    c.qty += qty;
    cell.set(k, c);
    grand += gross;
  }

  const ranked = Array.from(byProduct.entries())
    .filter(([p]) => p !== pin)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, top - (pin && byProduct.has(pin) ? 1 : 0)))
    .map(([p]) => p);
  const names = pin && byProduct.has(pin) ? [pin, ...ranked] : ranked;

  const shareOf = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
  const namedGrand = names.reduce((s, p) => s + (byProduct.get(p) ?? 0), 0);
  const columns = [
    ...names.map((p) => ({ product: p, gross: byProduct.get(p) ?? 0, share: shareOf(byProduct.get(p) ?? 0, grand) })),
    { product: OTHER_COL, gross: grand - namedGrand, share: shareOf(grand - namedGrand, grand) },
  ];

  const rowOf = (bucket: string, total: number, days: number, pick: (p: string) => { gross: number; qty: number }): GridRow => {
    const cells = names.map((p) => {
      const c = pick(p);
      return { product: p, gross: c.gross, qty: c.qty, share: shareOf(c.gross, total) };
    });
    const named = cells.reduce((s, c) => s + c.gross, 0);
    cells.push({ product: OTHER_COL, gross: total - named, qty: 0, share: shareOf(total - named, total) });
    return { bucket, days, total, cells };
  };

  const rows = Array.from(bucketTotal.keys())
    .sort((a, b) => b.localeCompare(a))
    .map((b) =>
      rowOf(b, bucketTotal.get(b) ?? 0, bucketDays.get(b)?.size ?? 0, (p) => cell.get(`${b}|${p}`) ?? { gross: 0, qty: 0 }),
    );

  const allDays = new Set(all.map((r) => r.sale_date)).size;
  const totalRow = rowOf('전체', grand, allDays, (p) => ({ gross: byProduct.get(p) ?? 0, qty: 0 }));

  return { columns, rows, totalRow };
}

/** 주 버킷(월요일 날짜) → '8월 3주차' — 그 달 안에서 월요일이 몇 번째인지 */
export function weekOrdinalLabel(mondayYmd: string): string {
  const m = Number(mondayYmd.slice(5, 7));
  const d = Number(mondayYmd.slice(8, 10));
  return `${m}월 ${Math.floor((d - 1) / 7) + 1}주차`;
}
