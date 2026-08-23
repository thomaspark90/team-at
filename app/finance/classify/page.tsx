import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import ClassifyPanel, { type TxRow, type Cat, type SplitRule } from '@/components/finance/ClassifyPanel';
import MonthShell from '@/components/finance/MonthShell';
import { computeUnclassifiedByMonth } from '@/lib/finance/boardTodos';
import { unitOf } from '@/lib/finance/types';

export default async function ClassifyPage({
  searchParams,
}: {
  searchParams: { ym?: string; type?: string; cat?: string; unclassified?: string; source?: string; brand?: string; store?: string; unit?: string };
}) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  // 선택된 달만 조회 — 전체를 한 번에 불러오면 Supabase 기본 1000행 캡에 걸려 오래된 달
  // (예: 2024-12)이 목록에서 통째로 빠진다(2026-08-03 버그). 사이드바 기본은 전월(MonthShell defaultYm).
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const prevMonth = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() - 1, 1));
  const defYm = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, '0')}`;
  // 'all' | 'YYYY'(연도 전체) | 'YYYY-MM' — 사이드바에서 연도 헤더를 누르면 그 해 전체를 분류(2026-08-20)
  const selYm =
    searchParams.ym === 'all'
      ? 'all'
      : searchParams.ym && /^\d{4}(-\d{2})?$/.test(searchParams.ym)
      ? searchParams.ym
      : defYm;

  // 브랜드 스코프 멤버는 해당 브랜드 거래만 — RLS 로도 강제되지만 서버 쿼리에서도 명시.
  let txQuery = supabase
    .schema('finance')
    .from('transactions')
    .select('id,memo,channel,normalized_key,amount_in,amount_out,category_id,tx_at,bank,source,is_installment,branch,brand,brand_basis,store,split_parent_id')
    .order('tx_at', { ascending: false });
  if (brandScope) txQuery = txQuery.eq('brand', brandScope);
  if (/^\d{4}-\d{2}$/.test(selYm)) txQuery = txQuery.eq('ym', selYm);
  else if (/^\d{4}$/.test(selYm)) txQuery = txQuery.gte('ym', `${selYm}-01`).lte('ym', `${selYm}-12`).limit(20000); // 연도 전체
  else txQuery = txQuery.limit(20000); // '전체 월'은 캡을 넉넉히 올려 누락 없이(실질 전체)
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

  // 좌측 연·월 사이드바(MonthShell)의 배지 브랜드 — 단위·스코프·브랜드 프리셋 순으로 결정
  const shellBrand =
    unit?.brand ??
    brandScope ??
    (presetBrand && ['garden', 'staffmeal', 'personal'].includes(presetBrand) ? presetBrand : undefined);
  // 분류 화면 배지 = 월별 '미분류 건수' — 화면에서 실제로 처리할 개수와 일치(자료 입력의 '남은 업무 수'와 다름)
  // 지점 단위(unit) 진입이면 지점 필터까지 반영 — 안 그러면 배지가 다른 지점 미분류까지 세어 화면 표시 건수와 어긋난다.
  const initialTodos = await computeUnclassifiedByMonth(supabase, shellBrand ?? undefined, unit?.store ?? undefined).catch(
    () => undefined,
  );

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

  // 학습된 지점 규칙(가맹점→지점) — 지점 미지정 행에 '제안'으로 원클릭 지정 가능하게(2026-08-17)
  const { data: storeRuleRows } = await supabase.schema('finance').from('store_rules').select('normalized_key,store');
  const storeRules = (storeRuleRows as { normalized_key: string; store: string }[] | null) ?? [];

  // 설정에서 '재무로'로 돌아올 때 지금 이 분류 화면(단위·월·필터 그대로)으로 오도록 현재 URL을 from으로 넘긴다.
  const backQs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === 'string' && v) backQs.set(k, v);
  const selfHref = `/finance/classify${backQs.toString() ? `?${backQs.toString()}` : ''}`;
  const settingsHref = `/finance/categories?from=${encodeURIComponent(selfHref)}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} scoped={!!brandScope} />
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">지출 자료 분류</h1>
          <div className="flex gap-4">
            <Link href="/finance/uploads" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              자료 이력 →
            </Link>
            {role === 'admin' && (
              <Link href={settingsHref} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                설정(계정과목) →
              </Link>
            )}
          </div>
        </div>
        {/* 좌측 연·월 사이드바 — 달을 고르면 URL(?ym=)로 이동해 그 달 거래만 서버에서 다시 조회.
            navigate 필수: 예전엔 클라 상태만 바꿔 서버가 그 달을 다시 안 불러 오래된 달이 비어 보였다(2026-08-03). */}
        <MonthShell brand={shellBrand} store={unit?.store ?? undefined} initialTodos={initialTodos} badgeKind="uncl" navigate yearSelectable>
          <ClassifyPanel
            txns={(txns as TxRow[]) ?? []}
            cats={(cats as Cat[]) ?? []}
            userId={user.id}
            confirmed={confirmed}
            rules={rules}
            splitRules={splitRules}
            storeRules={storeRules}
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
        </MonthShell>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '지출 자료 분류' };
