import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import { unitOf, UNITS } from '@/lib/finance/types';
import { buildExpensePrep, type ExpenseTx } from '@/lib/finance/prepExpense';

// 전처리1 — 지출 총합. 로우데이터 다음 단계로, 소스별 지출을 월 단위로 모으되
// 중복 제거(카드대금 − 수집분)를 계산식 그대로 화면에 드러낸다.
export default async function PrepExpensePage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const unit = unitOf(searchParams.unit) ?? UNITS[0];

  // 거래를 한 번에 읽어 메모리에서 집계한다 — 규칙(카드대금 판별·차감)이 코드 한곳에 모여 있어야
  // 화면에 계산식 그대로 보여줄 수 있다. 스탭밀 기준 5천 행 수준이라 부담 없음.
  let q = supabase
    .schema('finance')
    .from('transactions')
    .select('ym,source,memo,amount_out,amount_in,category_id,categories(type)')
    .eq('brand', unit.brand)
    .limit(50000);
  if (unit.store) q = q.eq('store', unit.store);
  const { data, error } = await q;
  if (error) throw new Error(`거래 조회 실패: ${error.message}`);

  const txns: ExpenseTx[] = (
    (data as unknown as (Omit<ExpenseTx, 'cat_type'> & { categories: { type: string } | null })[] | null) ?? []
  ).map((t) => ({
    ym: t.ym,
    source: t.source,
    memo: t.memo,
    amount_out: t.amount_out,
    amount_in: t.amount_in,
    category_id: t.category_id,
    cat_type: t.categories?.type ?? null,
  }));

  const { yms, rows, warnings } = buildExpensePrep(txns);
  const won = (n: number) => (n === 0 ? '' : n.toLocaleString());
  const warnByYm = new Map(warnings.map((w) => [w.ym, w.message]));

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
        <p className="mb-6 max-w-[860px] text-[13px] text-muted-foreground">
          <b>{unit.label}</b> 지출을 소스별로 모은 표예요. 같은 지출이 두 곳에 잡히지 않도록 <b>카드대금에서
          수집분을 빼는 계산</b>을 숨기지 않고 줄로 보여줘요 — 네이버페이·쿠팡 결제가 카드로 나가기 때문에,
          빼지 않으면 그만큼 원가가 부풀어요.
        </p>

        {warnings.length > 0 && (
          <ul className="mb-5 flex list-none flex-col gap-1 rounded-md border border-border bg-card/40 p-3 text-[12px] text-muted-foreground">
            {warnings.map((w) => (
              <li key={`${w.ym}-${w.message}`}>
                <b className="tabular-nums text-foreground">{w.ym}</b> — {w.message}
              </li>
            ))}
          </ul>
        )}

        <div className="overflow-auto rounded-md border border-border">
          <table className="w-max min-w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="sticky left-0 z-20 whitespace-nowrap bg-card px-3 py-2 text-left font-normal">구분</th>
                {yms.map((ym) => (
                  <th key={ym} className="whitespace-nowrap px-3 py-2 text-right font-normal tabular-nums">
                    {warnByYm.has(ym) && <span title={warnByYm.get(ym)}>⚠ </span>}
                    {ym}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isTotal = r.kind === 'total';
                const isNote = r.kind === 'note';
                const isDeduction = r.kind === 'deduction';
                const isDerived = r.kind === 'derived';
                return (
                  <tr
                    key={r.key}
                    className={`border-b border-border/50 last:border-0 ${
                      isTotal ? 'border-t-2 border-t-border font-medium' : ''
                    } ${isNote ? 'text-muted-foreground' : ''}`}
                  >
                    <td
                      className={`sticky left-0 z-10 whitespace-nowrap bg-background px-3 py-1.5 ${
                        isDeduction || isDerived ? 'pl-6 text-muted-foreground' : ''
                      }`}
                      title={r.hint}
                    >
                      {r.label}
                      {r.hint && <span className="ml-1 text-muted-foreground/50">ⓘ</span>}
                    </td>
                    {yms.map((ym) => (
                      <td
                        key={ym}
                        className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                          isDeduction ? 'text-muted-foreground' : ''
                        }`}
                      >
                        {isDeduction && r.amounts[ym] ? `−${won(r.amounts[ym])}` : won(r.amounts[ym] ?? 0)}
                      </td>
                    ))}
                  </tr>
                );
              })}
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
          <p className="m-0 mt-2">
            카드 결제일과 실제 사용일 사이에 시차가 있어요 — 6월에 쓴 걸 7월에 결제하면 월별 차감이 조금씩
            어긋나요. 달 하나만 보지 말고 몇 달을 함께 보는 게 정확해요.
          </p>
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: '전처리1 — 지출 총합' };
