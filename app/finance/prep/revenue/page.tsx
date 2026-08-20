import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import { unitOf, UNITS } from '@/lib/finance/types';
import type { ExpenseGrain, ExpenseTx } from '@/lib/finance/prepExpense';
import { buildRevenuePrep, type PosSaleRow, type GiftSaleRow } from '@/lib/finance/prepRevenue';

// 전처리3 — 매출 총합. POS 매출(발생)과 통장 입금(정산)을 나란히 놓고 대사한다.
// 차이를 숨기지 않고 '차이'와 '정산률' 열로 드러낸다 — 이상한 구간이 곧 조사할 지점.

const GRAINS: { key: ExpenseGrain; label: string }[] = [
  { key: 'day', label: '일별' },
  { key: 'week', label: '주별' },
  { key: 'month', label: '월별' },
];
const LIMIT: Record<ExpenseGrain, number> = { day: 45, week: 26, month: 24 };

export default async function PrepRevenuePage({
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

  let posQ = supabase
    .schema('finance')
    .from('pos_sales')
    .select('sale_date,gross')
    .eq('brand', unit.brand)
    .limit(50000);
  if (unit.store) posQ = posQ.eq('store', unit.store);
  // 통장 입금 — 매출 계정으로 분류된 거래만(조인 필터). 나머지 열 계산은 빌더가 한다.
  let txQ = supabase
    .schema('finance')
    .from('transactions')
    .select('tx_at,ym,source,memo,amount_out,amount_in,category_id,categories!inner(type,name)')
    .eq('brand', unit.brand)
    .eq('categories.type', 'revenue')
    .limit(50000);
  if (unit.store) txQ = txQ.eq('store', unit.store);

  // 자가 식권 판매(선수금) — 테이블 미생성 환경이면 열 생략(비치명)
  let giftQ = supabase
    .schema('finance')
    .from('pos_gift_sales')
    .select('sale_date,gross')
    .eq('brand', unit.brand)
    .limit(50000);
  if (unit.store) giftQ = giftQ.eq('store', unit.store);

  const [{ data: posData, error: posErr }, { data: txData, error: txErr }, { data: giftData }] = await Promise.all([
    posQ,
    txQ,
    giftQ,
  ]);
  if (posErr) throw new Error(`POS 매출 조회 실패: ${posErr.message}`);
  if (txErr) throw new Error(`통장 입금 조회 실패: ${txErr.message}`);

  const txns: ExpenseTx[] = (
    (txData as unknown as (Omit<ExpenseTx, 'cat_type' | 'cat_name'> & { categories: { type: string; name: string } })[] | null) ?? []
  ).map((t) => ({
    tx_at: t.tx_at,
    ym: t.ym,
    source: t.source,
    memo: t.memo,
    amount_out: t.amount_out,
    amount_in: t.amount_in,
    category_id: t.category_id,
    cat_type: t.categories.type,
    cat_name: t.categories.name,
  }));

  const { buckets: allBuckets, columns, warnings } = buildRevenuePrep(
    (posData as PosSaleRow[] | null) ?? [],
    txns,
    grain,
    (giftData as GiftSaleRow[] | null) ?? []
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
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">전처리3 — 매출 총합</h1>
          <Link
            href={`/finance/prep/expense-detail?unit=${unit.id}&grain=${grain}`}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← 전처리2 지출 세분화
          </Link>
        </div>
        <p className="mb-5 max-w-[880px] text-[13px] text-muted-foreground">
          매출 평가의 정본은 <b>POS 매출(발생주의 — 판매한 날 기준)</b>이에요. 관리손익도 이 기준이고요.
          이 표의 통장 입금 축은 매출 인식이 아니라 <b>회수 검증</b>이에요 — 카드는 1~2영업일,
          식권대장·올리브식권 정산은 <b>한 달</b> 늦게 들어오니, 식권 시차를 되돌린 <b>보정 정산률</b>이
          정상 범위(90~105%)인지로 &ldquo;{unit.label} 장사값이 제대로 들어오고 있나&rdquo;를 봐요.
        </p>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border">
            {GRAINS.map((g) => (
              <Link
                key={g.key}
                href={`/finance/prep/revenue?unit=${unit.id}&grain=${g.key}`}
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
            {isMonth
              ? '월 기준 — 보정 정산률 90~105% 밖이면 ⚠ (최신 1~2개월은 정산 대기라 판정 보류)'
              : '일·주는 정산 시차로 어긋나는 게 정상이라 경고를 걸지 않아요'}
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
                    } ${c.kind === 'derived' ? 'text-muted-foreground/70' : ''}`}
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
                    const classifyYm = grain === 'week' ? 'all' : isMonth ? b : b.slice(0, 7);
                    const href =
                      c.kind === 'income' && amount !== 0 && c.cat
                        ? `/finance/classify?unit=${unit.id}&ym=${classifyYm}&type=revenue&cat=${encodeURIComponent(c.cat)}`
                        : null;
                    const display =
                      c.key === 'rate' || c.key === 'rate_adj' ? (amount ? `${amount.toLocaleString()}%` : '') : won(amount);
                    return (
                      <td
                        key={c.key}
                        className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                          c.kind === 'total' ? 'border-l-2 border-l-border font-medium' : ''
                        } ${c.kind === 'derived' ? 'text-muted-foreground' : ''}`}
                      >
                        {href ? (
                          <Link
                            href={href}
                            className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                            title="누르면 해당 입금 건들이 분류 화면에 필터된 상태로 열려요"
                          >
                            {display}
                          </Link>
                        ) : (
                          display
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

export const metadata = { title: '전처리3 — 매출 총합' };
