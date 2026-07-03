import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { aggregate, type AggTx, type AggCat } from '@/lib/finance/aggregate';
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
    .select('ym,amount_in,amount_out,category_id');
  const { data: cats } = await supabase.schema('finance').from('categories').select('id,type,name,parent_id');

  const { months, expenseKeys } = aggregate((txns as AggTx[]) ?? [], (cats as AggCat[]) ?? []);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FAFBFC',
        fontFamily: "Inter,'Pretendard Variable','Pretendard',sans-serif",
        color: '#000000',
      }}
    >
      <TabNav />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>재무 대시보드</h1>
          <Link href="/finance" style={{ fontSize: 13, color: '#0099FF' }}>
            ← 업로드로
          </Link>
        </div>
        <Dashboard months={months} expenseKeys={expenseKeys} />
      </div>
    </div>
  );
}
