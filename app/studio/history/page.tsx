import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole, OWNER_EMAIL } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import TransferPanel from '@/components/finance/TransferPanel';
import NotifySettings from '@/components/NotifySettings';

// 송금 관리 — 대기/완료 전체 내역(월별) + 알림 설정
export default async function TransferManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  // 송금 알림 수신자(기본 대표)에게만 알림 설정 노출
  const notifyEmails = (process.env.NOTIFY_EMAIL ?? OWNER_EMAIL)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isNotifyRecipient = notifyEmails.includes((user.email ?? '').toLowerCase());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        {isNotifyRecipient && <NotifySettings />}
        <TransferPanel role={role} email={user.email ?? ''} mode="history" />
      </div>
    </div>
  );
}
