import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import type { AggTx, AggCat } from '@/lib/finance/aggregate';
import TabNav from '@/components/TabNav';
import Dashboard from '@/components/finance/Dashboard';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const { data: txns } = await supabase
    .schema('finance')
    .from('transactions')
    .select('tx_at,amount_in,amount_out,category_id');
  const { data: cats } = await supabase.schema('finance').from('categories').select('id,type,name,parent_id');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">재무 대시보드</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 업로드로
          </Link>
        </div>
        <Dashboard txns={(txns as AggTx[]) ?? []} cats={(cats as AggCat[]) ?? []} />
      </div>
    </div>
  );
}
