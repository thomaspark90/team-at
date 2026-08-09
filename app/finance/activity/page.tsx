import { redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { isOwner } from '@/lib/finance/access';
import { resolveRoleStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import ActivityLog, { type ActivityRow } from '@/components/finance/ActivityLog';

// 활동 로그 — 대표(OWNER) 전용. 누가 어떤 기능을 썼는지.
export default async function ActivityPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const role = await resolveRoleStamped(supabase, user);
  if (!isOwner(user.email)) redirect('/finance');

  const { data } = await supabase
    .schema('finance')
    .from('activity_logs')
    .select('id,created_at,email,action,detail')
    .order('created_at', { ascending: false })
    .limit(1000);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[860px] px-4 py-6 sm:px-6 sm:py-8">
        <ActivityLog rows={(data ?? []) as ActivityRow[]} />
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '활동 로그' };
