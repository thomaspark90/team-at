import type { SupabaseClient } from '@supabase/supabase-js';
import { mondayOf } from '@/lib/garden/review-sales';

// 메뉴×옵션 주별 판매 집계 — finance.pos_items(토스 품목 행) 기반.
// 데이터 현황: 양재천(토스)만 품목 행이 쌓인다. 판교(페이히어)는 결제 단위 리포트라
// 상품별 리포트 확보 전까지 비어 있고, 리포트 UI 는 행이 있는 지점만 그린다.
// 아메리카노 옵션 구조(양재천 토스 POS, 2026-08-08 대표 제공 스크린샷 기준):
//   핫\아이스(필수): Ice | Hot
//   원두(필수): 스테이(=메인 블렌드) | 라이트(+500, =시즈널) | 디카페인(+500)
// 옵션 컬럼은 원문 문자열이라 아래 분류는 토큰 포함 매칭 — 이름이 바뀌면 여기만 고친다.

export interface ItemRow {
  sale_date: string; // 'YYYY-MM-DD'
  ym: string;
  category: string;
  product: string;
  option: string;
  qty: number;
  supply: number;
  store?: string | null;
}

const PAGE = 1000;

/** dashboard_pos_items 를 끝까지 페이지네이션 조회 (뷰라 id 없음 → 유니크 키 순 정렬). */
export async function fetchItemRows(
  supabase: SupabaseClient,
  opts: { brand: string; since: string },
): Promise<ItemRow[]> {
  const rows: ItemRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .schema('finance')
      .from('dashboard_pos_items')
      .select('sale_date, ym, category, product, option, qty, supply, store')
      .eq('brand', opts.brand)
      .gte('sale_date', opts.since)
      .order('sale_date', { ascending: true })
      .order('category')
      .order('product')
      .order('option')
      .order('store')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as ItemRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// ---------- 분류 ----------

export type Temp = 'ice' | 'hot' | 'unknown';
export type Bean = '스테이(메인)' | '라이트(시즈널)' | '디카페인' | '기타';

export const isAmericano = (product: string) => product.includes('아메리카노');

/** ICE/HOT — 옵션 우선, 없으면 상품명에서 찾는다('아이스 아메리카노' 같은 별도 상품 대비). */
export function tempOf(product: string, option: string): Temp {
  const s = `${option} ${product}`;
  if (/ice|아이스/i.test(s)) return 'ice';
  if (/hot|핫|따뜻/i.test(s)) return 'hot';
  return 'unknown';
}

export function beanOf(option: string): Bean {
  if (option.includes('스테이')) return '스테이(메인)';
  if (option.includes('라이트')) return '라이트(시즈널)';
  if (option.includes('디카페인')) return '디카페인';
  return '기타';
}

// ---------- 주별 집계 ----------

export interface WeeklySeries {
  label: string;
  qty: number[]; // weeks 와 같은 길이
  supply: number[];
  totalQty: number;
  totalSupply: number;
}

export interface MenuWeekly {
  weeks: string[]; // 그 주 월요일 'YYYY-MM-DD', 오래된 → 최신
  menus: WeeklySeries[]; // 총 판매량 내림차순
}

/** 최근 weeksBack주(데이터가 있는 마지막 주 기준)의 주(월요일) 라벨 배열. */
export function recentWeeks(rows: ItemRow[], weeksBack: number): string[] {
  if (rows.length === 0) return [];
  let last = '';
  for (const r of rows) if (r.sale_date > last) last = r.sale_date;
  const end = new Date(mondayOf(last) + 'T00:00:00Z').getTime();
  const weeks: string[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    weeks.push(new Date(end - i * 7 * 86_400_000).toISOString().slice(0, 10));
  }
  return weeks;
}

function emptySeries(label: string, n: number): WeeklySeries {
  return { label, qty: new Array(n).fill(0), supply: new Array(n).fill(0), totalQty: 0, totalSupply: 0 };
}

function accumulate(series: WeeklySeries, weekIdx: number, r: ItemRow) {
  if (weekIdx < 0) return;
  series.qty[weekIdx] += Number(r.qty);
  series.supply[weekIdx] += Number(r.supply);
  series.totalQty += Number(r.qty);
  series.totalSupply += Number(r.supply);
}

/** 상품명 단위 주별 시계열 — 총 판매량 상위 topN 메뉴만. */
export function buildMenuWeekly(rows: ItemRow[], weeksBack = 12, topN = 8): MenuWeekly {
  const weeks = recentWeeks(rows, weeksBack);
  const idx = new Map(weeks.map((w, i) => [w, i]));
  const byMenu = new Map<string, WeeklySeries>();
  for (const r of rows) {
    const wi = idx.get(mondayOf(r.sale_date));
    if (wi === undefined) continue;
    const s = byMenu.get(r.product) ?? emptySeries(r.product, weeks.length);
    accumulate(s, wi, r);
    byMenu.set(r.product, s);
  }
  const menus = Array.from(byMenu.values())
    .filter((s) => s.totalQty > 0)
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, topN);
  return { weeks, menus };
}

export interface AmericanoWeekly {
  weeks: string[];
  temps: WeeklySeries[]; // 아이스 / 핫 (판매가 있는 것만)
  beans: WeeklySeries[]; // 스테이(메인) / 라이트(시즈널) / 디카페인 (판매가 있는 것만)
  totalQty: number;
  totalSupply: number;
}

/** 아메리카노만 골라 ICE/HOT × 원두(메인/시즈널/디카페인) 주별 시계열. */
export function buildAmericanoWeekly(rows: ItemRow[], weeksBack = 12): AmericanoWeekly {
  const ame = rows.filter((r) => isAmericano(r.product));
  const weeks = recentWeeks(ame, weeksBack);
  const idx = new Map(weeks.map((w, i) => [w, i]));

  const tempMap = new Map<string, WeeklySeries>([
    ['ice', emptySeries('아이스', weeks.length)],
    ['hot', emptySeries('핫', weeks.length)],
    ['unknown', emptySeries('구분 없음', weeks.length)],
  ]);
  const beanMap = new Map<string, WeeklySeries>();

  let totalQty = 0;
  let totalSupply = 0;
  for (const r of ame) {
    const wi = idx.get(mondayOf(r.sale_date));
    if (wi === undefined) continue;
    totalQty += Number(r.qty);
    totalSupply += Number(r.supply);
    accumulate(tempMap.get(tempOf(r.product, r.option))!, wi, r);
    const bean = beanOf(r.option);
    const s = beanMap.get(bean) ?? emptySeries(bean, weeks.length);
    accumulate(s, wi, r);
    beanMap.set(bean, s);
  }

  const beanOrder: Bean[] = ['스테이(메인)', '라이트(시즈널)', '디카페인', '기타'];
  return {
    weeks,
    temps: ['ice', 'hot', 'unknown'].map((k) => tempMap.get(k)!).filter((s) => s.totalQty > 0),
    beans: beanOrder
      .map((b) => beanMap.get(b))
      .filter((s): s is WeeklySeries => !!s && s.totalQty > 0),
    totalQty,
    totalSupply,
  };
}
