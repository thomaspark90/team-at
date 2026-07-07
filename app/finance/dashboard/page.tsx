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
  // 매출 = POS 공급가액(발생주의). viewer도 볼 수 있는 memo-free 뷰(dashboard_pos)에서 조회.
  // 뷰가 아직 없으면(마이그레이션 전) pos_sales로 폴백 — admin/classifier는 즉시 동작.
  let posRows = await supabase.schema('finance').from('dashboard_pos').select('sale_date,supply');
  if (posRows.error) posRows = await supabase.schema('finance').from('pos_sales').select('sale_date,supply');
  const posSales = ((posRows.data as { sale_date: string; supply: number }[] | null) ?? []).map((p) => ({ saleDate: p.sale_date, supply: p.supply }));

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
        <p className="mb-5 text-[13px] text-muted-foreground">
          <b>매출은 POS(발생주의)</b>, 지출은 통장·카드 기준이에요. 통장 현금흐름·잔액은 <Link href="/finance/cashflow" className="underline">월별 요약</Link>·<Link href="/finance/flow" className="underline">자금 흐름</Link>에서 봐요.
        </p>
        <Dashboard txns={(txns as AggTx[]) ?? []} cats={(cats as AggCat[]) ?? []} posSales={posSales} />
      </div>
    </div>
  );
}
