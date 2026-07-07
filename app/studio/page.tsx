import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import TransferPanel from '@/components/finance/TransferPanel';
import PushToggle from '@/components/PushToggle';
import { OWNER_EMAIL } from '@/lib/finance/access';

// 스탭밀 홈 = 대시보드 — 영수증 사진 업로드 → AI 인식 → 송금 대기 리스트.
// 업로드는 구글 로그인만 하면 가능, 이체 완료 처리는 admin/classifier 만.
export default async function StudioDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  // 송금 알림 수신자(기본 대표)에게만 푸시알림 토글 노출
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
        {isNotifyRecipient && <PushToggle />}
        <TransferPanel role={role} email={user.email ?? ''} />
      </div>
    </div>
  );
}
