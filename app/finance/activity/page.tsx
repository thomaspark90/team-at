import { redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { isOwner } from '@/lib/finance/access';
import { resolveRoleStamped } from '@/lib/access/stamp';
import PageShell from '@/components/PageShell';
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
    <PageShell nav={<FinanceNav role={role} />}>
      <ActivityLog rows={(data ?? []) as ActivityRow[]} />
    </PageShell>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '활동 로그' };
