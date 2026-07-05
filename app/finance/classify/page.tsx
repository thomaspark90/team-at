import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import ClassifyPanel, { type TxRow, type Cat } from '@/components/finance/ClassifyPanel';
import CardReconcile from '@/components/finance/CardReconcile';
import ReceiptEnrich from '@/components/finance/ReceiptEnrich';

export default async function ClassifyPage({
  searchParams,
}: {
  searchParams: { ym?: string; type?: string; cat?: string; unclassified?: string; source?: string };
}) {
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
    .select('id,memo,normalized_key,amount_in,amount_out,category_id,tx_at,bank,source,is_installment')
    .order('tx_at', { ascending: false });

  const { data: cats } = await supabase
    .schema('finance')
    .from('categories')
    .select('id,type,name,parent_id,pinned')
    .eq('active', true)
    .order('sort', { ascending: true });

  // 확정된 달은 분류 잠금
  const { data: closed } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('ym')
    .eq('status', 'confirmed');
  const confirmedYms = (closed as { ym: string }[] | null)?.map((c) => c.ym) ?? [];

  // 학습된 규칙(정규화키→계정) — 미분류 행에 '추천'으로 미리 선택
  const { data: ruleRows } = await supabase
    .schema('finance')
    .from('rules')
    .select('normalized_key,category_id');
  const rules = (ruleRows as { normalized_key: string; category_id: number }[] | null) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">거래 분류</h1>
          {role === 'admin' && (
            <Link href="/finance/categories" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              계정과목 관리 →
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1">
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
              }}
            />
          </div>
          {/* 우측 사이드바: 자료 보충(신한카드·쿠팡) */}
          <aside className="flex shrink-0 flex-col gap-5 lg:w-[400px]">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">자료 보충</div>
            <CardReconcile />
            <ReceiptEnrich />
          </aside>
        </div>
      </div>
    </div>
  );
}
