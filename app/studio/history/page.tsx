import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import TransferPanel from '@/components/finance/TransferPanel';

// 송금내역 — 대기/완료 전체를 월별로 열람
export default async function TransferHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <TransferPanel role={role} email={user.email ?? ''} mode="history" />
      </div>
    </div>
  );
}
