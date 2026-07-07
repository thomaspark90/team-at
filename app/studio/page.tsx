import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import TransferPanel from '@/components/finance/TransferPanel';

// 스탭밀 홈 = 대시보드 — 영수증 사진 업로드 → AI 인식 → 송금 대기 리스트.
// 업로드는 구글 로그인만 하면 가능, 이체 완료 처리는 admin/classifier 만.
export default async function StudioDashboardPage() {
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
      <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6 sm:py-8">
        <TransferPanel role={role} email={user.email ?? ''} />
      </div>
    </div>
  );
}
