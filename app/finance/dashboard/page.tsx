import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import type { AggTx, AggCat } from '@/lib/finance/aggregate';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import Dashboard from '@/components/finance/Dashboard';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role) redirect('/finance'); // 멤버(admin/classifier/viewer)만 — viewer는 이름 없는 안전 뷰로

  // dashboard_tx = memo(이름) 없는 멤버 전용 뷰. viewer도 읽을 수 있어 대시보드가 열림.
  const { data: txns } = await supabase
    .schema('finance')
    .from('dashboard_tx')
    .select('tx_at,amount_in,amount_out,category_id');
  const { data: cats } = await supabase.schema('finance').from('categories').select('id,type,name,parent_id,vat_taxable');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
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
