import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fallbackRecipients } from '@/lib/notify';
import TabNav from '@/components/TabNav';
import DashboardNav from '@/components/DashboardNav';
import TransferPanel from '@/components/finance/TransferPanel';
import VendorBook from '@/components/finance/VendorBook';
import NotifySettings from '@/components/NotifySettings';
import NotifyRecipients from '@/components/NotifyRecipients';

// 송금 관리 — 대기/완료 전체 내역(월별) + 알림 설정 + 수신자 관리(admin)
export default async function TransferManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);

  // 알림 수신자 — admin이 지정한 목록(비었거나 테이블 없으면 env/대표 폴백). 종류별 토글 포함.
  const { data: recipientRows } = await supabase
    .schema('finance')
    .from('notify_recipients')
    .select('*')
    .order('created_at');
  const recipientList = (recipientRows ?? []).map((r) => ({
    email: String(r.email),
    transfer: (r as Record<string, unknown>).transfer_enabled !== false,
    stock: (r as Record<string, unknown>).stock_enabled !== false,
  }));
  const recipients =
    recipientList.length > 0 ? recipientList.map((r) => r.email.toLowerCase()) : fallbackRecipients();
  const isNotifyRecipient = recipients.includes((user.email ?? '').toLowerCase());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <DashboardNav />
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        {(role === 'admin' || isNotifyRecipient) && (
          <div className={`grid gap-4 ${role === 'admin' && isNotifyRecipient ? 'sm:grid-cols-2' : ''}`}>
            {role === 'admin' && <NotifyRecipients initial={recipientList} />}
            {isNotifyRecipient && <NotifySettings />}
          </div>
        )}
        {['admin', 'classifier'].includes(role ?? '') && <VendorBook />}
        <TransferPanel role={role} email={user.email ?? ''} mode="history" />
      </div>
    </div>
  );
}
