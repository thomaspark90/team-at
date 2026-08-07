import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import SalesSummary from '@/components/SalesSummary';
import { fetchSalesRows, type SalesRow } from '@/lib/finance/sales-data';
import { STORES } from '@/lib/types';

// 가든 매출 — 토스(양재천)/페이히어(판교) POS 업로드(발생주의) 요약. 스탭밀 매출과 같은 구조.
// 지점 구분은 pos_sales 직조회에만 있어서(admin/classifier RLS 통과) 재무 권한자만 지점 필터를 쓰고,
// viewer 멤버는 dashboard_pos 뷰(안전 컬럼, 지점 없음)로 가든 전체 합만 본다.
export default async function GardenSalesPage({ searchParams }: { searchParams: { store?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  const isMember = role != null;
  const scopedOut = brandScope === 'staffmeal'; // 스탭밀 전용 멤버 — 가든 매출은 숨긴다
  const canSplitStore = ['admin', 'classifier'].includes(role ?? '');

  const storeParam = ['yangjae', 'pangyo'].includes(searchParams.store ?? '') ? searchParams.store! : 'all';
  const since = new Date(Date.now() - 396 * 86_400_000).toISOString().slice(0, 10);

  let rows: SalesRow[] = [];
  if (isMember && !scopedOut) {
    rows = await fetchSalesRows(supabase, {
      table: canSplitStore ? 'pos_sales' : 'dashboard_pos',
      brand: 'garden',
      since,
    }).catch(() => []);
  }
  const shown = canSplitStore && storeParam !== 'all' ? rows.filter((r) => r.store === storeParam) : rows;

  const storeTabs = [
    { key: 'all', label: '전체' },
    ...STORES.map((s) => ({ key: s.id, label: s.label })),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-[22px]">가든 매출</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              토스(양재천)·페이히어(판교) POS 업로드 기준 발생주의 매출이에요. 월 자료가 업로드돼야 반영됩니다.
            </p>
          </div>
          {canSplitStore && (
            <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
              {storeTabs.map((t) => (
                <Link
                  key={t.key}
                  href={t.key === 'all' ? '/garden/sales' : `/garden/sales?store=${t.key}`}
                  className={`rounded-lg px-3 py-1 text-[12px] ${
                    storeParam === t.key ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        {!isMember || scopedOut ? (
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="m-0 text-[13px] text-muted-foreground">
              {scopedOut
                ? '스탭밀 전용 계정이라 가든 매출은 볼 수 없어요.'
                : '매출은 재무 멤버만 볼 수 있어요. 필요하면 대표에게 멤버 등록(viewer)을 요청하세요.'}
            </p>
          </section>
        ) : shown.length === 0 ? (
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="m-0 text-[13px] text-muted-foreground">
              아직 집계된 POS 매출이 없어요. 회계 → 자료 입력에서 매출리포트를 올리면 여기에 나타납니다.
            </p>
          </section>
        ) : (
          <>
            {!canSplitStore && (
              <p className="m-0 text-[12px] text-muted-foreground">
                지점 구분은 재무 권한(admin/classifier)이 있어야 보여요 — 지금은 가든 전체 합계입니다.
              </p>
            )}
            <SalesSummary rows={shown} />
          </>
        )}
      </div>
    </div>
  );
}

export const metadata = { title: '가든 매출' };
