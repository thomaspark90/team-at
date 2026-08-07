import type { SalesRow } from '@/lib/finance/sales-data';

// 리뷰 × 매출 주간 조인 — 네이버 리뷰 유입과 POS 매출을 지점·주 단위로 겹쳐 본다.
// 날씨 분석과 달리 통제변수 없는 단순 상관이므로 해석 주의: 상관 ≠ 인과이고,
// '매출↑ → 방문↑ → 리뷰↑'의 역방향도 얼마든지 가능하다(화면에 문구로 고지).

export interface ReviewRow {
  reviewed_at: string; // ISO
  rating: number | null;
  store_key: string;
}

export interface WeekPoint {
  week: string; // 그 주 월요일 'YYYY-MM-DD' (KST)
  sales: number; // 주간 공급가액 합
  reviews: number; // 주간 리뷰 수
  avgRating: number | null;
}

export interface StoreReviewSales {
  store: string;
  weeks: WeekPoint[]; // 오래된 → 최신, 매출이 있는 주만
  corr: { same: number | null; lag1: number | null; n: number };
}

// KST 날짜의 그 주 월요일
export function mondayOf(ymdOrIso: string): string {
  const kst = new Date(new Date(ymdOrIso.length === 10 ? ymdOrIso + 'T00:00:00+09:00' : ymdOrIso).getTime() + 9 * 3600_000);
  const dow = (kst.getUTCDay() + 6) % 7; // 월=0
  return new Date(kst.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}

/** 피어슨 상관 — 표본이 적거나(6주 미만) 분산이 0이면 null. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 6) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/** 지점별 주간 시계열 + 상관(같은 주 / 리뷰 다음 주 매출). 매출 행엔 store 가 있어야 한다. */
export function buildReviewSales(sales: SalesRow[], reviews: ReviewRow[]): StoreReviewSales[] {
  const salesByStoreWeek = new Map<string, Map<string, number>>();
  for (const r of sales) {
    const store = r.store ?? '';
    if (!store) continue;
    const week = mondayOf(r.sale_date);
    const m = salesByStoreWeek.get(store) ?? new Map<string, number>();
    m.set(week, (m.get(week) ?? 0) + Number(r.supply));
    salesByStoreWeek.set(store, m);
  }

  const revByStoreWeek = new Map<string, Map<string, { count: number; ratingSum: number; rated: number }>>();
  for (const r of reviews) {
    const week = mondayOf(r.reviewed_at);
    const m = revByStoreWeek.get(r.store_key) ?? new Map();
    const cur = m.get(week) ?? { count: 0, ratingSum: 0, rated: 0 };
    cur.count++;
    if (r.rating != null) {
      cur.ratingSum += Number(r.rating);
      cur.rated++;
    }
    m.set(week, cur);
    revByStoreWeek.set(r.store_key, m);
  }

  const out: StoreReviewSales[] = [];
  for (const [store, weekSales] of Array.from(salesByStoreWeek.entries())) {
    const weeks = Array.from(weekSales.keys()).sort();
    // 진행 중인 이번 주는 매출·리뷰 모두 반쪽이라 상관을 오염시킨다 — 제외
    const thisWeek = mondayOf(new Date().toISOString());
    const complete = weeks.filter((w) => w < thisWeek);
    const points: WeekPoint[] = complete.map((week) => {
      const rev = revByStoreWeek.get(store)?.get(week);
      return {
        week,
        sales: weekSales.get(week) ?? 0,
        reviews: rev?.count ?? 0,
        avgRating: rev && rev.rated > 0 ? rev.ratingSum / rev.rated : null,
      };
    });
    const salesArr = points.map((p) => p.sales);
    const revArr = points.map((p) => p.reviews);
    out.push({
      store,
      weeks: points,
      corr: {
        same: pearson(revArr, salesArr),
        // 리뷰[t] ↔ 매출[t+1] — 리뷰가 다음 주 방문에 영향을 주는지
        lag1: pearson(revArr.slice(0, -1), salesArr.slice(1)),
        n: points.length,
      },
    });
  }
  return out.sort((a, b) => a.store.localeCompare(b.store));
}
