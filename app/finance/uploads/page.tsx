import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import UploadHistory, { type UploadRow } from '@/components/finance/UploadHistory';

export default async function UploadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const { data } = await supabase
    .schema('finance')
    .from('uploads')
    .select('id,source,bank,card_issuer,period_start,period_end,row_count,uploaded_at,settled_tx_id,statement_total')
    .order('uploaded_at', { ascending: false });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">자료 이력</h1>
          <Link href="/finance/classify" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 거래 분류
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">그동안 올린 은행·신한카드·쿠팡 영수증 자료의 이력이에요.</p>
        <UploadHistory uploads={(data as UploadRow[] | null) ?? []} />
      </div>
    </div>
  );
}
