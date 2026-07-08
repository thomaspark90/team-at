import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fallbackRecipients } from '@/lib/notify';
import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import TransferPanel from '@/components/finance/TransferPanel';
import NotifySettings from '@/components/NotifySettings';

// 스탭밀 홈 = 대시보드 — 영수증 사진 업로드 → AI 인식 → 송금 대기 리스트.
// 업로드는 구글 로그인만 하면 가능, 이체 완료 처리는 admin/classifier 만.
export default async function StudioDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);

  // 담당자(알림 수신자)는 송금 관리에서 알림을 관리하므로, 여기선 직원용(내 요청 완료 푸시)만 노출
  const { data: recipientRows } = await supabase
    .schema('finance')
    .from('notify_recipients')
    .select('email');
  const recipients =
    recipientRows && recipientRows.length > 0
      ? recipientRows.map((r) => String(r.email).toLowerCase())
      : fallbackRecipients();
  const isNotifyRecipient = recipients.includes((user.email ?? '').toLowerCase());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <TransferPanel role={role} email={user.email ?? ''} mode="dashboard" />
        {!isNotifyRecipient && (
          <div id="notify-optin" className="scroll-mt-20">
            <NotifySettings variant="requester" />
          </div>
        )}
      </div>
    </div>
  );
}
