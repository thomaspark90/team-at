import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import { unitOf, UNITS } from '@/lib/finance/types';
import type { ExpenseGrain, ExpenseTx } from '@/lib/finance/prepExpense';
import { buildExpenseDetail, type CategoryInfo } from '@/lib/finance/prepExpenseDetail';
import { fetchAllRows } from '@/lib/finance/fetchAll';
import { countUnassignedGardenForStore } from '@/lib/finance/unassignedStore';

// 전처리2 — 지출 세분화. 전처리1(소스별)과 같은 돈을 계정과목 축으로 다시 자른 표.
// 합계는 전처리1과 정확히 일치한다 — 다르면 어느 한쪽이 거짓말을 하는 것.

const GRAINS: { key: ExpenseGrain; label: string }[] = [
  { key: 'day', label: '일별' },
  { key: 'week', label: '주별' },
  { key: 'month', label: '월별' },
];
const LIMIT: Record<ExpenseGrain, number> = { day: 45, week: 26, month: 24 };

export default async function PrepExpenseDetailPage({
  searchParams,
}: {
  searchParams: { unit?: string; grain?: string };
}) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const unit = unitOf(searchParams.unit) ?? UNITS[0];
  if (unit.brand === 'personal') redirect('/finance/classify?unit=personal');
  const grain: ExpenseGrain = GRAINS.some((g) => g.key === searchParams.grain)
    ? (searchParams.grain as ExpenseGrain)
    : 'month';

  // 지점 뷰가 조용히 빼는 '지점 미지정' 가든 거래 — 경고 배너(2026-08-22 감사 D12, 월별 요약과 동일)
  const unassigned = unit.store
    ? await countUnassignedGardenForStore(supabase, unit.store)
    : { count: 0, sinceYm: null };

  // 전량 페이지 조회 — `.limit(50000)`은 서버 Max Rows(20000)에서 조용히 깎인다(2026-08-21 감사 P1-3)
  const [data, { data: catsData, error: catsErr }] = await Promise.all([
    fetchAllRows<Omit<ExpenseTx, 'cat_type' | 'cat_name'> & { categories: { type: string; name: string } | null }>(
      (from, to) => {
        let q = supabase
          .schema('finance')
          .from('transactions')
          .select('tx_at,ym,source,memo,amount_out,amount_in,category_id,categories(type,name)')
          .eq('brand', unit.brand)
          .order('id')
          .range(from, to);
        if (unit.store) q = q.eq('store', unit.store);
        return q;
      },
      { page: 20000, label: '거래' }
    ),
    supabase.schema('finance').from('categories').select('id,name,type,parent_id'),
  ]);
  if (catsErr) throw new Error(`계정과목 조회 실패: ${catsErr.message}`);

  const txns: ExpenseTx[] = data.map((t) => ({
    tx_at: t.tx_at,
    ym: t.ym,
    source: t.source,
    memo: t.memo,
    amount_out: t.amount_out,
    amount_in: t.amount_in,
    category_id: t.category_id,
    cat_type: t.categories?.type ?? null,
    cat_name: t.categories?.name ?? null,
  }));

  const { buckets: allBuckets, columns, warnings, summary } = buildExpenseDetail(
    txns,
    (catsData as CategoryInfo[] | null) ?? [],
    grain
  );
  const buckets = allBuckets.slice(0, LIMIT[grain]);
  const won = (n: number) => (n === 0 ? '' : n.toLocaleString());
  const warnByBucket = new Map(warnings.map((w) => [w.bucket, w.message]));
  const isMonth = grain === 'month';
  const bucketLabel = (b: string) => (grain === 'week' ? `${b.slice(5).replace('-', '/')}~` : b);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1680px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">전처리2 — 지출 세분화</h1>
          <Link
            href={`/finance/prep/expense?unit=${unit.id}&grain=${grain}`}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← 전처리1 지출 총합
          </Link>
        </div>
        <p className="mb-5 max-w-[880px] text-[13px] text-muted-foreground">
          <b>{unit.label}</b> 지출을 계정과목별로 펼친 표예요 — 전처리1과 같은 돈을 계정 축으로 다시 자른
          것이라 <b>합계가 전처리1과 정확히 같아야</b> 해요. 하위 계정(정규직·단기 등)은 최상위
          계정(인건비)으로 합쳐 보여요. 금액을 누르면 그 계정 건들이 분류 화면에 필터된 상태로 열려요.
        </p>

        {unit.store && unassigned.count > 0 && (
          <div className="mb-5 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
            ⚠️ 가든 공용(지점 미지정) 거래 {unassigned.count}건이 이 지점 운영 기간({unassigned.sinceYm}~)에
            있어요 — 지정 전까지 어느 지점 표에도 안 잡혀요. 분류 화면에서 지점을 지정해 주세요.
          </div>
        )}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border">
            {GRAINS.map((g) => (
              <Link
                key={g.key}
                href={`/finance/prep/expense-detail?unit=${unit.id}&grain=${g.key}`}
                aria-current={g.key === grain ? 'page' : undefined}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  g.key === grain ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {g.label}
              </Link>
            ))}
          </div>
          <span className="text-[12px] text-muted-foreground">
            {isMonth ? '비용 기준 — 카드대금에서 수집분을 뺀 값' : '현금흐름 기준 — 나간 돈 그대로'}
            {allBuckets.length > buckets.length && ` · 최근 ${buckets.length}개 구간`}
          </span>
        </div>

        {warnings.length > 0 && (
          <ul className="mb-5 flex list-none flex-col gap-1 rounded-md border border-border bg-card/40 p-3 text-[12px] text-muted-foreground">
            {warnings
              .filter((w) => buckets.includes(w.bucket))
              .map((w) => (
                <li key={`${w.bucket}-${w.message}`}>
                  <b className="tabular-nums text-foreground">{w.bucket}</b> — {w.message}
                </li>
              ))}
          </ul>
        )}

        {/* 상단 요약 — 5+1 그룹. 그룹 합 = 아래 상세 열 합 = 지출 합계 */}
        <h2 className="mb-2 mt-2 text-[15px] font-medium">{isMonth ? '월별' : grain === 'week' ? '주별' : '일별'} 요약</h2>
        <div className="mb-8 overflow-auto rounded-md border border-border">
          <table className="w-max min-w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="sticky left-0 z-20 whitespace-nowrap bg-card px-3 py-2 text-left font-normal">기간</th>
                {summary.map((c) => (
                  <th
                    key={c.key}
                    title={c.hint}
                    className={`whitespace-nowrap px-3 py-2 text-right font-normal ${
                      c.kind === 'total' ? 'border-l-2 border-l-border font-medium text-foreground' : ''
                    } ${c.kind === 'note' ? 'text-muted-foreground/70' : ''}`}
                  >
                    {c.label}
                    {c.hint && <span className="ml-1 text-muted-foreground/50">ⓘ</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b} className="border-b border-border/50 last:border-0">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-background px-3 py-1.5 tabular-nums">
                    {warnByBucket.has(b) && <span title={warnByBucket.get(b)}>⚠ </span>}
                    {bucketLabel(b)}
                  </td>
                  {summary.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                        c.kind === 'total' ? 'border-l-2 border-l-border font-medium' : ''
                      } ${c.kind === 'note' ? 'text-muted-foreground' : ''}`}
                    >
                      {won(c.amounts[b] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mb-2 text-[15px] font-medium">계정별 상세</h2>
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-max min-w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="sticky left-0 z-20 whitespace-nowrap bg-card px-3 py-2 text-left font-normal">기간</th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    title={c.hint}
                    className={`whitespace-nowrap px-3 py-2 text-right font-normal ${
                      c.kind === 'total' ? 'border-l-2 border-l-border font-medium text-foreground' : ''
                    } ${c.kind === 'note' || c.kind === 'derived' ? 'text-muted-foreground/70' : ''}`}
                  >
                    {c.label}
                    {c.hint && <span className="ml-1 text-muted-foreground/50">ⓘ</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b} className="border-b border-border/50 last:border-0">
                  <td
                    className="sticky left-0 z-10 whitespace-nowrap bg-background px-3 py-1.5 tabular-nums"
                    title={warnByBucket.get(b)}
                  >
                    {warnByBucket.has(b) && <span title={warnByBucket.get(b)}>⚠ </span>}
                    {bucketLabel(b)}
                  </td>
                  {columns.map((c) => {
                    const amount = c.amounts[b] ?? 0;
                    // 분류 화면 드릴다운 — 주 뷰는 두 달에 걸칠 수 있어 달 필터 없이 연다(전처리1과 동일)
                    const classifyYm = grain === 'week' ? 'all' : isMonth ? b : b.slice(0, 7);
                    const href =
                      c.kind === 'category' && amount !== 0 && c.filter
                        ? `/finance/classify?unit=${unit.id}&ym=${classifyYm}&type=${c.filter.type}&cat=${encodeURIComponent(c.filter.cat)}`
                        : c.key === 'unclassified' && amount > 0
                          ? `/finance/classify?unit=${unit.id}&ym=${classifyYm}&unclassified=1`
                          : c.key === 'misang' && amount !== 0
                            ? `/finance/classify?unit=${unit.id}&ym=${classifyYm}&type=excluded&cat=${encodeURIComponent('미상')}`
                            : null;
                    return (
                      <td
                        key={c.key}
                        className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                          c.kind === 'total' ? 'border-l-2 border-l-border font-medium' : ''
                        } ${c.kind === 'note' || c.kind === 'derived' ? 'text-muted-foreground' : ''}`}
                      >
                        {href ? (
                          <Link
                            href={href}
                            className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                            title="누르면 해당 건들이 분류 화면에 필터된 상태로 열려요"
                          >
                            {won(amount)}
                          </Link>
                        ) : (
                          won(amount)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-1 text-[12px] text-muted-foreground">
          {columns
            .filter((c) => c.hint)
            .map((c) => (
              <p key={c.key} className="m-0">
                <b className="text-foreground">{c.label}</b> — {c.hint}
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: '전처리2 — 지출 세분화' };
