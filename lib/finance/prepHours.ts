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
