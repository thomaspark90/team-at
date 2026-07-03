import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import ClassifyPanel, { type TxRow, type Cat } from '@/components/finance/ClassifyPanel';

export default async function ClassifyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const { data: txns } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,memo,normalized_key,amount_in,amount_out,category_id,tx_at')
    .order('tx_at', { ascending: false });

  const { data: cats } = await supabase
    .schema('finance')
    .from('categories')
    .select('id,type,name,parent_id,pinned')
    .eq('active', true)
    .order('sort', { ascending: true });

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
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>거래 분류</h1>
          <div style={{ display: 'flex', gap: 16 }}>
            {role === 'admin' && (
              <Link href="/finance/categories" style={{ fontSize: 13, color: '#0099FF', fontWeight: 600 }}>
                계정과목 관리 →
              </Link>
            )}
            <Link href="/finance" style={{ fontSize: 13, color: '#0099FF' }}>
              ← 업로드로
            </Link>
          </div>
        </div>
        <ClassifyPanel txns={(txns as TxRow[]) ?? []} cats={(cats as Cat[]) ?? []} userId={user.id} />
      </div>
    </div>
  );
}
