import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { cashflow } from '@/lib/finance/cashflow';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
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
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">통장 현황</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 업로드로
          </Link>
        </div>
        <p className="mb-6 mt-0 text-[14px] text-muted-foreground">
          월별로 은행별 입금·출금과 두 통장 합계를 집계해요. (분류와 무관하게 통장 자체의 인/아웃)
        </p>
        <Cashflow months={months} />
      </div>
    </div>
  );
}
