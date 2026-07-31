import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import ClassifyPanel, { type TxRow, type Cat, type SplitRule } from '@/components/finance/ClassifyPanel';
import { unitOf } from '@/lib/finance/types';

export default async function ClassifyPage({
  searchParams,
}: {
  searchParams: { ym?: string; type?: string; cat?: string; unclassified?: string; source?: string; brand?: string; store?: string; unit?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  // 브랜드 스코프 멤버는 해당 브랜드 거래만 — RLS 로도 강제되지만 서버 쿼리에서도 명시.
  let txQuery = supabase
    .schema('finance')
    .from('transactions')
    .select('id,memo,channel,normalized_key,amount_in,amount_out,category_id,tx_at,bank,source,is_installment,branch,brand,store,split_parent_id')
    .order('tx_at', { ascending: false });
  if (brandScope) txQuery = txQuery.eq('brand', brandScope);
  const txns = unwrap(await txQuery, '거래');

  const cats = unwrap(
    await supabase
      .schema('finance')
      .from('categories')
      .select('id,type,name,parent_id,pinned')
      .eq('active', true)
      .order('sort', { ascending: true }),
    '계정과목',
  );

  // 확정된 달은 분류 잠금 — 확정은 3단위 (ym, brand, store)
  const closed = unwrap(
    await supabase.schema('finance').from('monthly_close').select('ym,brand,store').eq('status', 'confirmed'),
    '월 확정',
  );
  const confirmed =
    (closed as { ym: string; brand?: string; store?: string | null }[] | null)?.map((c) => ({
      ym: c.ym,
      brand: c.brand ?? 'garden',
      store: c.store || null,
    })) ?? [];

  // 단위(unit) 파라미터 → 브랜드/지점 필터 프리셋 (내비 3단위 진입용)
  const unit = unitOf(searchParams.unit);
  const presetBrand = unit ? unit.brand : searchParams.brand;
  const presetStore = unit ? (unit.store ?? undefined) : searchParams.store;

  // 학습된 규칙(정규화키→계정) — 미분류 행에 '추천'으로 미리 선택
  const ruleRows = unwrap(
    await supabase.schema('finance').from('rules').select('normalized_key,category_id,brand'),
    '학습 규칙',
  );
  const rules = (ruleRows as { normalized_key: string; category_id: number; brand: string }[] | null) ?? [];

  // 건별 분할 비율 규칙 — 같은 가맹점은 '분할 추천'으로 강조 (테이블 미생성 시 조용히 빈 목록)
  const { data: splitRuleRows } = await supabase
    .schema('finance')
    .from('split_rules')
    .select('normalized_key,brand,allocations');
  const splitRules = (splitRuleRows as SplitRule[] | null) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} scoped={!!brandScope} />
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
          confirmed={confirmed}
          rules={rules}
          splitRules={splitRules}
          lockedBrand={brandScope}
          fixedUnit={unit ? { brand: unit.brand, store: unit.store } : null}
          initialFilter={{
            ym: searchParams.ym,
            type: searchParams.type,
            cat: searchParams.cat,
            unclassified: searchParams.unclassified === '1',
            source: searchParams.source,
            brand: presetBrand,
            store: presetStore,
          }}
        />
      </div>
    </div>
  );
}
