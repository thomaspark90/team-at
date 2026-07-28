import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveMember, canConfirm } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import MonthlyCloseManager, { type MonthRow } from '@/components/finance/MonthlyCloseManager';
import { brandLabel, BRANDS } from '@/lib/finance/types';

export default async function ClosePage({ searchParams }: { searchParams: { brand?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  // 브랜드 스코프 멤버는 분류 화면이 홈
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');
  const allowConfirm = await canConfirm(supabase, user);
  // 확정은 브랜드별 — 한쪽 미분류가 다른 쪽 마감을 막지 않는다
  const brand = searchParams.brand === 'staffmeal' ? ('staffmeal' as const) : ('garden' as const);

  // 월별 거래수·미분류수 집계 (데이터량이 작아 JS 집계) — 선택된 브랜드만
  const txns = unwrap(
    await supabase.schema('finance').from('transactions').select('ym,category_id').eq('brand', brand),
    '거래',
  );

  const closes = unwrap(
    await supabase
      .schema('finance')
      .from('monthly_close')
      .select('ym,status,confirmed_at,brand')
      .eq('brand', brand),
    '월 확정',
  );

  const closeMap = new Map(
    (closes ?? []).map((c: { ym: string; status: string; confirmed_at: string | null }) => [c.ym, c])
  );
  const agg = new Map<string, { total: number; unclassified: number }>();
  for (const t of (txns as { ym: string; category_id: number | null }[]) ?? []) {
    const a = agg.get(t.ym) ?? { total: 0, unclassified: 0 };
    a.total += 1;
    if (t.category_id == null) a.unclassified += 1;
    agg.set(t.ym, a);
  }
  const months: MonthRow[] = Array.from(agg.entries())
    .map(([ym, a]) => {
      const c = closeMap.get(ym);
      return {
        ym,
        total: a.total,
        unclassified: a.unclassified,
        status: (c?.status as MonthRow['status']) ?? 'open',
        confirmedAt: c?.confirmed_at ?? null,
      };
    })
    .sort((a, b) => b.ym.localeCompare(a.ym));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">월 확정</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 재무 홈
          </Link>
        </div>
        <p className="mb-4 mt-0 text-[13px] leading-[1.6] text-muted-foreground">
          확정은 <b>브랜드별</b>로 해요 — {brandLabel(brand)}의 미분류가 0건인 달만 확정할 수 있고, 확정하면 그 달·그 브랜드의
          자료 분류가 잠겨요. {allowConfirm ? '' : '(확정 권한은 관리자에게 요청하세요.)'}
        </p>
        {/* 브랜드 탭 */}
        <div className="mb-5 flex overflow-hidden self-start rounded-md border border-border" style={{ width: 'fit-content' }}>
          {BRANDS.map((b) => (
            <Link
              key={b.id}
              href={`/finance/close?brand=${b.id}`}
              aria-current={b.id === brand ? 'page' : undefined}
              className={`px-3 py-1.5 text-[13px] transition-colors ${
                b.id === brand ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {b.label}
            </Link>
          ))}
        </div>
        <MonthlyCloseManager key={brand} months={months} canConfirm={allowConfirm} brand={brand} />
      </div>
    </div>
  );
}
