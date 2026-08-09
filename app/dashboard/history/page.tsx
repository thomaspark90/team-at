import { redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import { fallbackRecipients } from '@/lib/notify';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import TransferPanel from '@/components/finance/TransferPanel';
import VendorBook from '@/components/finance/VendorBook';
import NotifySettings from '@/components/NotifySettings';
import NotifyRecipients from '@/components/NotifyRecipients';

// 송금 설정 — 알림 설정 + 수신자 관리(admin) + 대기/완료 전체 내역(월별)
export default async function TransferManagePage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);

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
      <AccountingNav role={role} scoped={!!brandScope} />
      <div className="mx-auto max-w-[1120px] divide-y divide-border px-4 py-6 sm:px-6 sm:py-8">
        {(role === 'admin' || isNotifyRecipient) && (
          <div className="pb-[54px]">
            <div className={`grid gap-x-4 gap-y-8 ${role === 'admin' && isNotifyRecipient ? 'sm:grid-cols-2' : ''}`}>
              {role === 'admin' && <NotifyRecipients initial={recipientList} />}
              {isNotifyRecipient && <NotifySettings />}
            </div>
          </div>
        )}
        {['admin', 'classifier'].includes(role ?? '') && (
          <div className="py-[54px]">
            <VendorBook />
          </div>
        )}
        <div className="pt-[54px]">
          <TransferPanel role={role} email={user.email ?? ''} mode="history" />
        </div>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '송금 설정' };
