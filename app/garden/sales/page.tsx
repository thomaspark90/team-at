import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import SalesSummary from '@/components/SalesSummary';
import ReviewSalesReport from '@/components/garden/ReviewSalesReport';
import MenuSalesReport from '@/components/garden/MenuSalesReport';
import { fetchSalesRows, type SalesRow } from '@/lib/finance/sales-data';
import { buildReviewSales, type ReviewRow, type StoreReviewSales } from '@/lib/garden/review-sales';
import { buildAmericanoSeries, buildMenuSeries, fetchItemRows, type Granularity, type ItemRow } from '@/lib/garden/menu-sales';
import { STORES } from '@/lib/types';

const GRAN_TABS: { key: Granularity; label: string }[] = [
  { key: 'day', label: '일' },
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
];

// 가든 매출 — 토스(양재천)/페이히어(판교) POS 업로드(발생주의) 요약. 스탭밀 매출과 같은 구조.
// dashboard_pos 뷰에 store 가 추가돼(2026-08-08 마이그레이션) 재무 멤버 전원(viewer 포함)이
// 지점 필터와 리뷰×매출 리포트를 본다. 접근 통제는 뷰의 my_role()/brand_scope 필터가 담당.
export default async function GardenSalesPage({ searchParams }: { searchParams: { store?: string; gran?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  const isMember = role != null;
  const scopedOut = brandScope === 'staffmeal'; // 스탭밀 전용 멤버 — 가든 매출은 숨긴다

  const storeParam = ['yangjae', 'pangyo'].includes(searchParams.store ?? '') ? searchParams.store! : 'all';
  const gran: Granularity = (['day', 'week', 'month'] as const).includes(searchParams.gran as Granularity)
    ? (searchParams.gran as Granularity)
    : 'week';
  const since = new Date(Date.now() - 396 * 86_400_000).toISOString().slice(0, 10);
  // 메뉴별 품목 리포트는 12주 캡 없이 오픈 이후 전체를 본다 — 데이터가 얼마 없어 성능 부담이 없다.
  const itemsSince = '2020-01-01';

  let rows: SalesRow[] = [];
  let itemRows: ItemRow[] = [];
  if (isMember && !scopedOut) {
    [rows, itemRows] = await Promise.all([
      fetchSalesRows(supabase, { table: 'dashboard_pos', brand: 'garden', since }).catch(() => []),
      // 품목 행은 현재 양재천(토스)만 쌓인다 — 마이그레이션 전이거나 비어 있으면 조용히 [].
      fetchItemRows(supabase, { brand: 'garden', since: itemsSince }).catch(() => []),
    ]);
  }
  const shown = storeParam !== 'all' ? rows.filter((r) => r.store === storeParam) : rows;
  const shownItems = storeParam !== 'all' ? itemRows.filter((r) => r.store === storeParam) : itemRows;
  const americano = buildAmericanoSeries(shownItems, gran);
  const menuSeries = buildMenuSeries(shownItems, gran, 8);

  // 리뷰 × 매출 주간 리포트 — 매출을 볼 수 있는 멤버라면 함께 본다 (리뷰는 팀 전체 열람 데이터)
  let reviewSales: StoreReviewSales[] = [];
  if (rows.length > 0) {
    const reviews: ReviewRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .schema('finance')
        .from('place_reviews')
        .select('reviewed_at, rating, store_key')
        .order('reviewed_at', { ascending: true })
        .order('review_id', { ascending: true })
        .range(from, from + 999);
      if (error || !data) break;
      reviews.push(...(data as ReviewRow[]));
      if (data.length < 1000) break;
    }
    reviewSales = buildReviewSales(rows, reviews);
  }

  const storeTabs = [
    { key: 'all', label: '전체' },
    ...STORES.map((s) => ({ key: s.id, label: s.label })),
  ];
  // store·gran 둘 다 실어 나르는 링크 — 지점 탭 클릭해도 보던 단위(일/주/월) 유지, 반대도 동일
  const hrefFor = (store: string, g: Granularity) => {
    const p = new URLSearchParams();
    if (store !== 'all') p.set('store', store);
    if (g !== 'week') p.set('gran', g);
    const qs = p.toString();
    return qs ? `/garden/sales?${qs}` : '/garden/sales';
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-[22px]">가든 매출</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              토스(양재천)·페이히어(판교) POS 업로드 기준 발생주의 매출이에요. 월 자료가 업로드돼야 반영됩니다.
            </p>
          </div>
          {isMember && !scopedOut && (
            <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
              {storeTabs.map((t) => (
                <Link
                  key={t.key}
                  href={hrefFor(t.key, gran)}
                  className={`rounded-lg px-3 py-1 text-[13px] ${
                    storeParam === t.key ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        {isMember && !scopedOut && shown.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted-foreground">메뉴 리포트 단위</span>
            <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
              {GRAN_TABS.map((g) => (
                <Link
                  key={g.key}
                  href={hrefFor(storeParam, g.key)}
                  className={`rounded-lg px-3 py-1 text-[13px] ${
                    gran === g.key ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {g.label}
                </Link>
              ))}
            </div>
          </div>
        )}
        {!isMember || scopedOut ? (
          <section>
            <p className="m-0 text-[13px] text-muted-foreground">
              {scopedOut
                ? '스탭밀 전용 계정이라 가든 매출은 볼 수 없어요.'
                : '매출은 재무 멤버만 볼 수 있어요. 필요하면 대표에게 멤버 등록(viewer)을 요청하세요.'}
            </p>
          </section>
        ) : shown.length === 0 ? (
          <section>
            <p className="m-0 text-[13px] text-muted-foreground">
              아직 집계된 POS 매출이 없어요. 회계 → 자료 입력에서 매출리포트를 올리면 여기에 나타납니다.
            </p>
          </section>
        ) : (
          <>
            <SalesSummary rows={shown} />
            <MenuSalesReport americano={americano} menus={menuSeries} />
            {reviewSales.length > 0 && <ReviewSalesReport data={reviewSales} />}
          </>
        )}
      </div>
    </div>
  );
}

export const metadata = { title: '가든 매출' };
