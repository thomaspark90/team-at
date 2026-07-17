import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole, canConfirm } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import MonthlyCloseManager, { type MonthRow } from '@/components/finance/MonthlyCloseManager';

export default async function ClosePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');
  const allowConfirm = await canConfirm(supabase, user);

  // 월별 거래수·미분류수 집계 (데이터량이 작아 JS 집계)
  const txns = unwrap(
    await supabase.schema('finance').from('transactions').select('ym,category_id'),
    '거래',
  );

  const closes = unwrap(
    await supabase.schema('finance').from('monthly_close').select('ym,status,confirmed_at'),
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
        <p className="mb-5 mt-0 text-[13px] leading-[1.6] text-muted-foreground">
          미분류가 0건인 달만 확정할 수 있어요. 확정하면 그 달의 자료 분류가 잠기고 대시보드 집계에 반영돼요.
          {allowConfirm ? '' : ' (확정 권한은 관리자에게 요청하세요.)'}
        </p>
        <MonthlyCloseManager months={months} canConfirm={allowConfirm} />
      </div>
    </div>
  );
}
