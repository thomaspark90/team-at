import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import CategoryManager, { type ManagedCat } from '@/components/finance/CategoryManager';

export default async function CategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (role !== 'admin') redirect('/finance');

  const { data } = await supabase
    .schema('finance')
    .from('categories')
    .select('id,type,name,parent_id,active,pinned,sort')
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
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>계정과목 관리</h1>
          <Link href="/finance" style={{ fontSize: 13, color: '#0099FF' }}>
            ← 재무로
          </Link>
        </div>
        <CategoryManager initial={(data as ManagedCat[]) ?? []} />
      </div>
    </div>
  );
}
