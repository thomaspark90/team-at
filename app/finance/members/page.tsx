import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
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
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FAFBFC',
        fontFamily: "Inter,'Pretendard Variable','Pretendard',sans-serif",
        color: '#000000',
      }}
    >
      <TabNav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>멤버 관리</h1>
          <Link href="/finance" style={{ fontSize: 13, color: '#0099FF' }}>
            ← 재무로
          </Link>
        </div>
        <p style={{ fontSize: 14, color: '#888', margin: '0 0 24px' }}>
          접근 요청을 승인하고 역할을 부여해요. 역할을 &lsquo;대기&rsquo;로 되돌리면 접근이 막혀요.
        </p>
        <MemberManager initial={(data as Member[]) ?? []} />
      </div>
    </div>
  );
}
