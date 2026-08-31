import type { SupabaseClient } from '@supabase/supabase-js';
import { mondayOf } from '@/lib/garden/review-sales';

// 메뉴×옵션 판매 집계(일/주/월 전환 가능) — finance.pos_items(토스 품목 행) 기반.
// 데이터 현황: 양재천(토스)만 품목 행이 쌓인다. 판교(페이히어)는 결제 단위 리포트라
// 상품별 리포트 확보 전까지 비어 있고, 리포트 UI 는 행이 있는 지점만 그린다.
// 아메리카노 옵션 구조(양재천 토스 POS, 2026-08-08 대표 제공 스크린샷 기준):
//   핫\아이스(필수): Ice | Hot
//   원두(필수): 스테이(=메인 블렌드) | 라이트(+500, =시즈널) | 디카페인(+500)
// 옵션 컬럼은 원문 문자열이라 아래 분류는 토큰 포함 매칭 — 이름이 바뀌면 여기만 고친다.
// 매칭 안 되는 옵션은 '기타'/'구분 없음'으로 빠지고 unclassifiedOptions 에 모아 리포트에 경고로 뜬다.

export interface ItemRow {
  sale_date: string; // 'YYYY-MM-DD'
  ym: string;
  category: string;
  product: string;
  option: string;
  qty: number;
  supply: number; // 공급가액 — 손익용
  gross?: number; // 실판매금액(VAT 포함) — 화면 표시용(2026-08-31)
  store?: string | null;
}

// ⚠️ 프로젝트 Max Rows(Settings→API, 2026-08-09 기준 20000) 이하로 유지 — 넘으면 응답이
// 조용히 잘려 최근 달이 누락된다. 왕복 1회당 1~2초라 낮게 잡을수록(예전 1000) 느려진다.
const PAGE = 20000;

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
      .select('sale_date, ym, category, product, option, qty, supply, gross, store')
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

// ---------- 기간 단위 ----------

export type Granularity = 'day' | 'week' | 'month';

const addDays = (ymd: string, n: number): string =>
  new Date(new Date(ymd + 'T00:00:00Z').getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** 날짜 → 버킷 키. day=그 날짜, week=그 주 월요일, month='YYYY-MM'. */
export function bucketOf(ymd: string, gran: Granularity): string {
  if (gran === 'day') return ymd;
  if (gran === 'week') return mondayOf(ymd);
  return ymd.slice(0, 7);
}

/** 버킷 키 → 축·툴팁 표시 라벨. */
export function bucketLabel(bucket: string, gran: Granularity): string {
  if (gran === 'month') return `${Number(bucket.slice(5, 7))}월`;
  const md = bucket.slice(5).replace('-', '.');
  return gran === 'week' ? `${md} 주` : md;
}

export const granUnitLabel = (gran: Granularity) => (gran === 'day' ? '일' : gran === 'week' ? '주' : '개월');

/** 데이터 범위(최초~최근) 전체를 빈틈없이 채운 버킷 목록 — 캡 없이 오픈 이후 전체. */
export function allBuckets(rows: { sale_date: string }[], gran: Granularity): string[] {
  if (rows.length === 0) return [];
  let min = rows[0].sale_date;
  let max = rows[0].sale_date;
  for (const r of rows) {
    if (r.sale_date < min) min = r.sale_date;
    if (r.sale_date > max) max = r.sale_date;
  }
  const out: string[] = [];
  if (gran === 'day') {
    for (let cur = min; cur <= max; cur = addDays(cur, 1)) out.push(cur);
    return out;
  }
  if (gran === 'week') {
    const end = mondayOf(max);
    for (let cur = mondayOf(min); cur <= end; cur = addDays(cur, 7)) out.push(cur);
    return out;
  }
  // month
  let y = Number(min.slice(0, 4));
  let m = Number(min.slice(5, 7));
  const endYm = max.slice(0, 7);
  let guard = 0;
  while (guard++ < 1000) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    out.push(ym);
    if (ym >= endYm) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// ---------- 집계 ----------

export interface PeriodSeries {
  label: string;
  qty: number[]; // buckets 와 같은 길이
  supply: number[];
  totalQty: number;
  totalSupply: number;
}

export interface MenuPeriod {
  gran: Granularity;
  buckets: string[]; // 오래된 → 최신
  menus: PeriodSeries[]; // 총 판매량 내림차순
}

function emptySeries(label: string, n: number): PeriodSeries {
  return { label, qty: new Array(n).fill(0), supply: new Array(n).fill(0), totalQty: 0, totalSupply: 0 };
}

function accumulate(series: PeriodSeries, bucketIdx: number, r: ItemRow) {
  if (bucketIdx < 0) return;
  series.qty[bucketIdx] += Number(r.qty);
  series.supply[bucketIdx] += Number(r.gross ?? r.supply);
  series.totalQty += Number(r.qty);
  series.totalSupply += Number(r.gross ?? r.supply);
}

/** 상품명 단위 기간별 시계열 — 오픈 이후 전체, 총 판매량 상위 topN 메뉴만. */
export function buildMenuSeries(rows: ItemRow[], gran: Granularity, topN = 8): MenuPeriod {
  const buckets = allBuckets(rows, gran);
  const idx = new Map(buckets.map((b, i) => [b, i]));
  const byMenu = new Map<string, PeriodSeries>();
  for (const r of rows) {
    const bi = idx.get(bucketOf(r.sale_date, gran));
    if (bi === undefined) continue;
    const s = byMenu.get(r.product) ?? emptySeries(r.product, buckets.length);
    accumulate(s, bi, r);
    byMenu.set(r.product, s);
  }
  const menus = Array.from(byMenu.values())
    .filter((s) => s.totalQty > 0)
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, topN);
  return { gran, buckets, menus };
}

export interface AmericanoPeriod {
  gran: Granularity;
  buckets: string[];
  temps: PeriodSeries[]; // 아이스 / 핫 (판매가 있는 것만)
  beans: PeriodSeries[]; // 스테이(메인) / 라이트(시즈널) / 디카페인 (판매가 있는 것만)
  totalQty: number;
  totalSupply: number;
  unclassifiedOptions: string[]; // ICE/HOT 또는 원두 분류가 안 된 옵션 원문(정렬됨)
}

/** 아메리카노만 골라 ICE/HOT × 원두(메인/시즈널/디카페인) 기간별 시계열 — 오픈 이후 전체. */
export function buildAmericanoSeries(rows: ItemRow[], gran: Granularity): AmericanoPeriod {
  const ame = rows.filter((r) => isAmericano(r.product));
  const buckets = allBuckets(ame, gran);
  const idx = new Map(buckets.map((b, i) => [b, i]));

  const tempMap = new Map<string, PeriodSeries>([
    ['ice', emptySeries('아이스', buckets.length)],
    ['hot', emptySeries('핫', buckets.length)],
    ['unknown', emptySeries('구분 없음', buckets.length)],
  ]);
  const beanMap = new Map<string, PeriodSeries>();
  const unclassified = new Set<string>();

  let totalQty = 0;
  let totalSupply = 0;
  for (const r of ame) {
    const bi = idx.get(bucketOf(r.sale_date, gran));
    if (bi === undefined) continue;
    totalQty += Number(r.qty);
    totalSupply += Number(r.gross ?? r.supply);
    const temp = tempOf(r.product, r.option);
    const bean = beanOf(r.option);
    if (temp === 'unknown' || bean === '기타') unclassified.add(r.option || '(옵션 없음)');
    accumulate(tempMap.get(temp)!, bi, r);
    const s = beanMap.get(bean) ?? emptySeries(bean, buckets.length);
    accumulate(s, bi, r);
    beanMap.set(bean, s);
  }

  const beanOrder: Bean[] = ['스테이(메인)', '라이트(시즈널)', '디카페인', '기타'];
  return {
    gran,
    buckets,
    temps: ['ice', 'hot', 'unknown'].map((k) => tempMap.get(k)!).filter((s) => s.totalQty > 0),
    beans: beanOrder
      .map((b) => beanMap.get(b))
      .filter((s): s is PeriodSeries => !!s && s.totalQty > 0),
    totalQty,
    totalSupply,
    unclassifiedOptions: Array.from(unclassified).sort(),
  };
}
