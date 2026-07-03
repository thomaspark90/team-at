import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { cashflow } from '@/lib/finance/cashflow';
import TabNav from '@/components/TabNav';
import Cashflow from '@/components/finance/Cashflow';

interface CashTx {
  ym: string;
  bank: string;
  amount_in: number;
  amount_out: number;
}

export default async function CashflowPage() {
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
    .select('ym,bank,amount_in,amount_out');

  const months = cashflow((txns as CashTx[]) ?? []);

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
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>통장 현황</h1>
          <Link href="/finance" style={{ fontSize: 13, color: '#0099FF' }}>
            ← 업로드로
          </Link>
        </div>
        <p style={{ fontSize: 14, color: '#888', margin: '0 0 24px' }}>
          월별로 은행별 입금·출금과 두 통장 합계를 집계해요. (분류와 무관하게 통장 자체의 인/아웃)
        </p>
        <Cashflow months={months} />
      </div>
    </div>
  );
}
