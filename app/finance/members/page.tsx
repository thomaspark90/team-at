import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import MemberManager, { type Member } from '@/components/finance/MemberManager';

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (role !== 'admin') redirect('/finance');

  const { data } = await supabase
    .schema('finance')
    .from('members')
    .select('id,email,role,can_confirm')
    .order('created_at', { ascending: true });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">멤버 관리</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 재무로
          </Link>
        </div>
        <p className="mb-6 mt-0 text-[13px] text-muted-foreground">
          접근 요청을 승인하고 역할을 부여해요. 역할을 &lsquo;대기&rsquo;로 되돌리면 접근이 막혀요.
        </p>
        <MemberManager initial={(data as Member[]) ?? []} />
      </div>
    </div>
  );
}
