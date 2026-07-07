import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import TransferPanel from '@/components/finance/TransferPanel';

// 송금 요청 — 영수증 사진 업로드는 구글 로그인만 하면 가능(finance 멤버 아니어도 OK).
export default async function TransferPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6 sm:py-8">
        <TransferPanel role={role} email={user.email ?? ''} />
      </div>
    </div>
  );
}
