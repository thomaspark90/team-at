import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import { unitOf, UNITS } from '@/lib/finance/types';
import { buildExpensePrep, type ExpenseGrain, type ExpenseTx } from '@/lib/finance/prepExpense';

// 전처리1 — 지출 총합. 로우데이터 다음 단계로, 소스별 지출을 기간 단위로 모으되
// 중복 제거(카드대금 − 수집분)를 계산식 그대로 화면에 드러낸다.
// 일·주 뷰는 현금흐름, 월 뷰는 비용 — 카드대금 덩어리가 풀리기 전까지 둘은 다르다.

const GRAINS: { key: ExpenseGrain; label: string }[] = [
  { key: 'day', label: '일별' },
  { key: 'week', label: '주별' },
  { key: 'month', label: '월별' },
];

// 일·주는 칸이 많아 화면에 담기지 않으니 최근 구간만
const LIMIT: Record<ExpenseGrain, number> = { day: 45, week: 26, month: 24 };

export default async function PrepExpensePage({
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
  // 개인(personal)은 손익 제외 사적 지출 — 관리손익과 같은 규칙으로 이 화면에서도 뺀다
  if (unit.brand === 'personal') redirect('/finance/classify?unit=personal');
  const grain: ExpenseGrain = GRAINS.some((g) => g.key === searchParams.grain)
    ? (searchParams.grain as ExpenseGrain)
    : 'month';

  // 거래를 한 번에 읽어 메모리에서 집계한다 — 규칙(카드대금 판별·차감)이 코드 한곳에 모여 있어야
  // 화면에 계산식 그대로 보여줄 수 있다. 스탭밀 기준 5천 행 수준이라 부담 없음.
  let q = supabase
    .schema('finance')
    .from('transactions')
    .select('tx_at,ym,source,memo,amount_out,amount_in,category_id,categories(type,name)')
    .eq('brand', unit.brand)
    .limit(50000);
  if (unit.store) q = q.eq('store', unit.store);
  const { data, error } = await q;
  if (error) throw new Error(`거래 조회 실패: ${error.message}`);

  const txns: ExpenseTx[] = (
    (data as unknown as (Omit<ExpenseTx, 'cat_type' | 'cat_name'> & { categories: { type: string; name: string } | null })[] | null) ?? []
  ).map((t) => ({
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

  const { buckets: allBuckets, rows, warnings } = buildExpensePrep(txns, grain);
  const buckets = allBuckets.slice(0, LIMIT[grain]);
  const won = (n: number) => (n === 0 ? '' : n.toLocaleString());
  const warnByBucket = new Map(warnings.map((w) => [w.bucket, w.message]));
  const isMonth = grain === 'month';
  // 주는 시작일(월요일)로 묶여 있으니 '8/18~' 처럼 보여줘야 읽힌다
  const bucketLabel = (b: string) => (grain === 'week' ? `${b.slice(5).replace('-', '/')}~` : b);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1680px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">전처리1 — 지출 총합</h1>
          <Link
            href={`/finance/raw?unit=${unit.id}`}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← 로우데이터
          </Link>
        </div>
        <p className="mb-5 max-w-[880px] text-[13px] text-muted-foreground">
          <b>{unit.label}</b> 지출을 소스별로 모은 표예요.{' '}
          {isMonth ? (
            <>
              같은 지출이 두 곳에 잡히지 않도록 <b>카드대금에서 수집분을 빼는 계산</b>을 숨기지 않고 줄로
              보여줘요 — 네이버페이·쿠팡 결제가 카드로 나가기 때문에, 빼지 않으면 그만큼 원가가 부풀어요.
            </>
          ) : (
            <>
              <b>돈이 언제 나갔는지(현금흐름)</b>를 보는 뷰예요. 카드대금은 결제일에 목돈으로 빠지고 그 안의
              네이버페이 건은 사용일에 흩어져 있어, 같은 칸에서 뺄 수가 없어 겹친 채로 둬요. 카드명세를 올려
              분류하면 덩어리가 사용일별로 풀리면서 이 겹침이 사라져요.
            </>
          )}
        </p>

        {/* 기간 단위 토글 */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border">
            {GRAINS.map((g) => (
              <Link
                key={g.key}
                href={`/finance/prep/expense?unit=${unit.id}&grain=${g.key}`}
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

        <div className="overflow-auto rounded-md border border-border">
          <table className="w-max min-w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="sticky left-0 z-20 whitespace-nowrap bg-card px-3 py-2 text-left font-normal">기간</th>
                {rows.map((r) => {
                  const isTotal = r.kind === 'total';
                  const isMutedCol = r.kind === 'deduction' || r.kind === 'derived' || r.kind === 'note';
                  return (
                    <th
                      key={r.key}
                      title={r.hint}
                      className={`whitespace-nowrap px-3 py-2 text-right font-normal ${
                        isTotal ? 'border-l-2 border-l-border font-medium text-foreground' : ''
                      } ${isMutedCol ? 'text-muted-foreground/70' : ''}`}
                    >
                      {r.label}
                      {r.hint && <span className="ml-1 text-muted-foreground/50">ⓘ</span>}
                    </th>
                  );
                })}
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
                  {rows.map((r) => {
                    const isTotal = r.kind === 'total';
                    const isNote = r.kind === 'note';
                    const isDeduction = r.kind === 'deduction';
                    const amount = r.amounts[b] ?? 0;
                    // 미분류·미상 금액은 분류 화면으로 가는 문 — 셀을 누르면 해당 건들이
                    // 필터된 상태로 열려 바로 분류할 수 있다. 분류 화면은 월 단위라:
                    //   월·일 뷰 → 그 달로 필터. 주 뷰 → 주가 두 달에 걸치면 시작월 필터가
                    //   일부 건을 숨기므로(실측 13건·20.9M) 달 필터 없이 전체 미분류로 연다.
                    const classifyYm = grain === 'week' ? null : isMonth ? b : b.slice(0, 7);
                    const ymParam = classifyYm ? `&ym=${classifyYm}` : '&ym=all';
                    const classifyHref =
                      r.key === 'unclassified' && amount > 0
                        ? `/finance/classify?unit=${unit.id}${ymParam}&unclassified=1`
                        : r.key === 'misang' && amount !== 0
                          ? `/finance/classify?unit=${unit.id}${ymParam}&type=excluded&cat=${encodeURIComponent('미상')}`
                          : null;
                    return (
                      <td
                        key={r.key}
                        className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                          isTotal ? 'border-l-2 border-l-border font-medium' : ''
                        } ${isDeduction || isNote ? 'text-muted-foreground' : ''}`}
                      >
                        {classifyHref ? (
                          <Link
                            href={classifyHref}
                            className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                            title="누르면 이 달 해당 건들이 분류 화면에 필터된 상태로 열려요"
                          >
                            {won(amount)}
                          </Link>
                        ) : isDeduction && amount ? (
                          `−${won(amount)}`
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
          {rows
            .filter((r) => r.hint)
            .map((r) => (
              <p key={r.key} className="m-0">
                <b className="text-foreground">{r.label}</b> — {r.hint}
              </p>
            ))}
          {isMonth && (
            <p className="m-0 mt-2">
              카드 결제일과 실제 사용일 사이에 시차가 있어요 — 6월에 쓴 걸 7월에 결제하면 월별 차감이 조금씩
              어긋나요. 달 하나만 보지 말고 몇 달을 함께 보는 게 정확해요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: '전처리1 — 지출 총합' };
