import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import ClassifyPanel, { type TxRow, type Cat } from '@/components/finance/ClassifyPanel';

export default async function ClassifyPage({
  searchParams,
}: {
  searchParams: { ym?: string; type?: string; cat?: string; unclassified?: string; source?: string; brand?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const txns = unwrap(
    await supabase
      .schema('finance')
      .from('transactions')
      .select('id,memo,channel,normalized_key,amount_in,amount_out,category_id,tx_at,bank,source,is_installment,branch')
      .order('tx_at', { ascending: false }),
    '거래',
  );

  const cats = unwrap(
    await supabase
      .schema('finance')
      .from('categories')
      .select('id,type,name,parent_id,pinned')
      .eq('active', true)
      .order('sort', { ascending: true }),
    '계정과목',
  );

  // 확정된 달은 분류 잠금
  const closed = unwrap(
    await supabase.schema('finance').from('monthly_close').select('ym').eq('status', 'confirmed'),
    '월 확정',
  );
  const confirmedYms = (closed as { ym: string }[] | null)?.map((c) => c.ym) ?? [];

  // 학습된 규칙(정규화키→계정) — 미분류 행에 '추천'으로 미리 선택
  const ruleRows = unwrap(
    await supabase.schema('finance').from('rules').select('normalized_key,category_id'),
    '학습 규칙',
  );
  const rules = (ruleRows as { normalized_key: string; category_id: number }[] | null) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">자료 분류</h1>
          <div className="flex gap-4">
            <Link href="/finance/uploads" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              자료 이력 →
            </Link>
            {role === 'admin' && (
              <Link href="/finance/categories" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                계정과목 관리 →
              </Link>
            )}
          </div>
        </div>
        <ClassifyPanel
          txns={(txns as TxRow[]) ?? []}
          cats={(cats as Cat[]) ?? []}
          userId={user.id}
          confirmedYms={confirmedYms}
          rules={rules}
          initialFilter={{
            ym: searchParams.ym,
            type: searchParams.type,
            cat: searchParams.cat,
            unclassified: searchParams.unclassified === '1',
            source: searchParams.source,
            brand: searchParams.brand,
          }}
        />
      </div>
    </div>
  );
}
