import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import { unitOf, UNITS } from '@/lib/finance/types';
import type { ExpenseGrain } from '@/lib/finance/prepExpense';
import { fetchAllRows } from '@/lib/finance/fetchAll';
import { buildHoursPrep, productOptions, type HourSale, type TrendRow } from '@/lib/finance/prepHours';
import HoursProductPicker from '@/components/finance/HoursProductPicker';

// 전처리5 — 시간대별 판매. pos_item_hours(영업일 × 시각 × 상품)를 시간대·기간·요일 세 축으로 편다.
// 그램 단위 판매 상품(가든 양재천 '브런치바')은 정가 ÷ 그램당 단가로 평균 그램을 함께 낸다.

const GRAINS: { key: ExpenseGrain; label: string }[] = [
  { key: 'day', label: '일별' },
  { key: 'week', label: '주별' },
  { key: 'month', label: '월별' },
];
const SPANS: { key: string; label: string; days: number | null }[] = [
  { key: '1m', label: '최근 1개월', days: 31 },
  { key: '3m', label: '최근 3개월', days: 92 },
  { key: '6m', label: '최근 6개월', days: 184 },
  { key: 'all', label: '전체', days: null },
];
const TREND_LIMIT: Record<ExpenseGrain, number> = { day: 60, week: 26, month: 24 };

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function PrepHoursPage({
  searchParams,
}: {
  searchParams: { unit?: string; product?: string; grain?: string; span?: string };
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
    : 'day';
  const span = SPANS.find((s) => s.key === searchParams.span) ?? SPANS[1];
  const since = span.days ? ymd(new Date(Date.now() - span.days * 86_400_000)) : null;
  const store = unit.store ?? '';

  const rows = await fetchAllRows<HourSale>(
    (from, to) => {
      let q = supabase
        .schema('finance')
        .from('pos_item_hours')
        .select('sale_date,hour,category,product,option,qty,orders,list_price,gross')
        .eq('brand', unit.brand)
        .eq('store', store)
        .order('id')
        .range(from, to);
      if (since) q = q.gte('sale_date', since);
      return q;
    },
    { page: 20000, label: '시간대 판매', missingTableOk: true },
  );

  const products = productOptions(rows, unit.brand, store);
  // 기본 상품 — 요청한 상품이 이 기간에 없으면 그램 상품 우선, 그다음 판매 건수 1위
  const wanted = searchParams.product ?? '';
  const selected =
    products.find((p) => p.product === wanted)?.product ??
    products.find((p) => p.gram)?.product ??
    products[0]?.product ??
    '';
  const picked = rows.filter((r) => r.product === selected);
  const { hours, trend: allTrend, dow, totals, rule } = buildHoursPrep(picked, unit.brand, store, grain);
  const trend = allTrend.slice(0, TREND_LIMIT[grain]);

  const href = (next: { product?: string; grain?: string; span?: string }) =>
    `/finance/prep/hours?unit=${unit.id}&product=${encodeURIComponent(next.product ?? selected)}&grain=${
      next.grain ?? grain
    }&span=${next.span ?? span.key}`;

  const n0 = (v: number) => Math.round(v).toLocaleString();
  const n1 = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}시`;
  const hasGram = totals.grams !== null;
  const maxQty = Math.max(1, ...hours.map((h) => Math.abs(h.qty)));
  const bucketLabel = (b: string) =>
    grain === 'week' ? `${b.slice(5).replace('-', '/')}~` : grain === 'day' ? b.slice(5).replace('-', '/') : b;

  const trendTable = (list: TrendRow[], firstLabel: string, showHours: boolean) => (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-max min-w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border text-muted-foreground">
            <th className="whitespace-nowrap px-3 py-2 text-left font-normal">{firstLabel}</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-normal">영업일</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-normal">판매 건수</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-normal">하루 평균</th>
            {hasGram && <th className="whitespace-nowrap px-3 py-2 text-right font-normal">평균 그램</th>}
            <th className="whitespace-nowrap px-3 py-2 text-right font-normal">건당 금액</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-normal">매출</th>
            {showHours && <th className="whitespace-nowrap px-3 py-2 text-right font-normal">판매 시간대</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.bucket} className="border-b border-border/50 last:border-0">
              <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{bucketLabel(t.bucket)}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">{t.days}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{n0(t.qty)}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                {t.days ? n1(t.qty / t.days) : ''}
              </td>
              {hasGram && (
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                  {t.avgGram === null ? '' : `${n0(t.avgGram)}g`}
                </td>
              )}
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                {t.avgPrice === null ? '' : n0(t.avgPrice)}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{n0(t.gross)}</td>
              {showHours && (
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {t.firstHour === null ? '' : `${hourLabel(t.firstHour)}~${hourLabel(t.lastHour ?? t.firstHour)}`}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1680px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">전처리5 — 시간대별 판매</h1>
          <Link
            href={`/finance/prep/menu?unit=${unit.id}`}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← 전처리4 메뉴별 판매
          </Link>
        </div>
        <p className="mb-5 max-w-[880px] text-[13px] text-muted-foreground">
          <b>{unit.label}</b>의 POS 원본에 있는 <b>주문시작시각</b>을 살려 상품별로 &lsquo;몇 시에 몇 개&rsquo;를
          보는 표예요. 저울로 다는 상품(브런치바)은 <b>정가 ÷ 그램당 단가</b>로 평균 그램을 함께 냅니다 —
          할인·선불권 결제는 실판매금액이 깎여서 그램 계산엔 <b>정가</b>를 씁니다.
        </p>

        {rows.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/40 px-4 py-6 text-[13px] text-muted-foreground">
            이 기간에 시간대 자료가 없어요. 시간대 행은 <b>토스 POS 매출리포트</b>에서만 만들어지고
            (판교·스탭밀 페이히어 리포트엔 시각 컬럼이 없어요), 2026-08-26 이전에 올린 파일은 아직 비어 있을 수
            있어요 — 회계 → 자료 입력에서 해당 월 리포트를 다시 올리면 채워집니다.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <HoursProductPicker
                products={products.map((p) => ({ product: p.product, category: p.category, qty: p.qty, gram: p.gram }))}
                value={selected}
                unit={unit.id}
                grain={grain}
                span={span.key}
              />
              <div className="flex overflow-hidden rounded-md border border-border">
                {SPANS.map((s) => (
                  <Link
                    key={s.key}
                    href={href({ span: s.key })}
                    aria-current={s.key === span.key ? 'page' : undefined}
                    className={`px-3 py-1.5 text-[13px] transition-colors ${
                      s.key === span.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
              <div className="flex overflow-hidden rounded-md border border-border">
                {GRAINS.map((g) => (
                  <Link
                    key={g.key}
                    href={href({ grain: g.key })}
                    aria-current={g.key === grain ? 'page' : undefined}
                    className={`px-3 py-1.5 text-[13px] transition-colors ${
                      g.key === grain ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {g.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2 rounded-md bg-muted/40 px-4 py-3 text-[13px]">
              <span>
                판매 건수 <b className="tabular-nums">{n0(totals.qty)}</b>
                <span className="text-muted-foreground">
                  {' '}
                  · 주문 {n0(totals.orders)}건 · 영업일 {totals.days}일
                </span>
              </span>
              {hasGram && (
                <span>
                  평균 <b className="tabular-nums">{n0(totals.avgGram ?? 0)}g</b>
                  <span className="text-muted-foreground"> · 총 {n0((totals.grams ?? 0) / 1000)}kg</span>
                </span>
              )}
              <span>
                건당 <b className="tabular-nums">{n0(totals.qty ? totals.gross / totals.qty : 0)}원</b>
                <span className="text-muted-foreground"> · 매출 {n0(totals.gross)}원(VAT 포함)</span>
              </span>
              <span className="text-muted-foreground">
                하루 평균 {totals.days ? n1(totals.qty / totals.days) : 0}건
              </span>
            </div>

            <h2 className="mb-2 text-[15px] font-medium">시간대별</h2>
            <div className="mb-2 overflow-auto rounded-md border border-border">
              <table className="w-max min-w-full border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="whitespace-nowrap px-3 py-2 text-left font-normal">시간</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-normal">판매 건수</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-normal">하루 평균</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-normal">비중</th>
                    {hasGram && <th className="whitespace-nowrap px-3 py-2 text-right font-normal">평균 그램</th>}
                    {hasGram && <th className="whitespace-nowrap px-3 py-2 text-right font-normal">총 그램</th>}
                    <th className="whitespace-nowrap px-3 py-2 text-right font-normal">주문 수</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-normal">매출</th>
                    <th className="w-[220px] px-3 py-2 text-left font-normal">분포</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map((h) => (
                    <tr key={h.hour} className="border-b border-border/50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{hourLabel(h.hour)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{n0(h.qty)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {n1(h.perDay)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {(h.share * 100).toFixed(1)}%
                      </td>
                      {hasGram && (
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                          {h.avgGram === null ? '' : `${n0(h.avgGram)}g`}
                        </td>
                      )}
                      {hasGram && (
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {h.grams === null ? '' : `${n0(h.grams / 1000)}kg`}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {n0(h.orders)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{n0(h.gross)}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className="block h-2 rounded-sm bg-foreground/70"
                          style={{ width: `${Math.max(2, (Math.abs(h.qty) / maxQty) * 100)}%` }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mb-8 text-[12px] text-muted-foreground">
              영업일 기준이라 자정을 넘긴 주문은 전날 영업일에 0~2시로 잡혀요. &lsquo;주문 수&rsquo;는 그 시간대
              안의 서로 다른 주문번호 수 — 한 주문에 두 접시가 들어가면 판매 건수 2 · 주문 수 1이에요.
            </p>

            <h2 className="mb-2 text-[15px] font-medium">기간 추이</h2>
            <div className="mb-8">{trendTable(trend, '구간', true)}</div>

            <h2 className="mb-2 text-[15px] font-medium">요일별</h2>
            <div className="mb-4">{trendTable(dow, '요일', false)}</div>

            <div className="flex flex-col gap-1 text-[12px] text-muted-foreground">
              {rule ? (
                <p className="m-0">
                  <b className="text-foreground">그램 환산</b> — {selected}는 {rule.priceLabel} 기준,{' '}
                  <b>정가 ÷ {rule.wonPerGram}원 = 그램</b>으로 계산해요(적용 {rule.from}~{rule.to ?? '현재'}).
                  {rule.note ? ` ${rule.note}` : ''} 단가가 바뀌면 <code>lib/finance/gramProducts.ts</code>에 새
                  구간을 추가해야 옛 기간이 안 틀어져요.
                </p>
              ) : (
                <p className="m-0">
                  <b className="text-foreground">그램 환산</b> — {selected}는 그램 단위 판매 상품으로 등록돼 있지
                  않아 그램 열이 없어요(<code>lib/finance/gramProducts.ts</code>).
                </p>
              )}
              <p className="m-0">
                매출은 <b>실판매금액(할인 반영, VAT 포함)</b>, 그램은 <b>정가</b> 기준이에요 — 그래서 할인이 있는
                날은 &lsquo;건당 금액 ÷ 그램당 단가&rsquo;가 평균 그램보다 작게 나옵니다.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const metadata = { title: '전처리5 — 시간대별 판매' };
