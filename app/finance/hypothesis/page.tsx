import { redirect } from 'next/navigation';
import Link from 'next/link';
import { get as getBlob } from '@vercel/blob';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import { fetchAllRows } from '@/lib/finance/fetchAll';
import { UNITS, unitOf } from '@/lib/finance/types';
import { WEATHER_SALES_CACHE_PATH, simpleImpact, type DayPoint } from '@/lib/garden/weatherSales';
import { isKrHoliday } from '@/lib/garden/krHolidays';
import { GRAM_PRODUCTS } from '@/lib/finance/gramProducts';
import {
  cannibalHypothesis,
  holidayHypothesis,
  niceWeatherHypothesis,
  productShareHypothesis,
  rainHypothesis,
  seasonHypothesis,
  VERDICT_LABEL,
  type HypothesisCard,
  type Verdict,
} from '@/lib/finance/hypotheses';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';

// 가설 — 현장 체감·통념을 우리 데이터로 검증하는 화면(2026-08-31 신설).
// 판정은 코드가 숫자에서 만든다(lib/finance/hypotheses.ts) — 사람이 결론을 적어두면
// 데이터가 바뀌어도 그대로 남아 거짓말이 된다.

const BADGE: Record<Verdict, string> = {
  confirmed: 'bg-foreground text-background',
  refuted: 'bg-destructive/10 text-destructive border border-destructive/30',
  mixed: 'bg-muted text-foreground border border-border',
  insufficient: 'bg-muted/50 text-muted-foreground border border-border',
};

export default async function HypothesisPage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');
  const role = await resolveRoleStamped(supabase, user);
  if (!role) redirect('/finance');

  const unit = unitOf(searchParams.unit) ?? UNITS[0];
  const store = unit.store ?? '';

  // 날씨 캐시(하루 1회 계산분)를 읽기만 한다 — 재계산은 가든 → 날씨 분석에서.
  const loadWeather = async () => {
    if (unit.brand !== 'garden') return null;
    try {
      const res = await getBlob(WEATHER_SALES_CACHE_PATH, { access: 'private', useCache: false });
      if (!res) return null;
      const cached = JSON.parse(await new Response(res.stream).text());
      const daily = (cached?.payload?.daily?.[store] ?? []) as DayPoint[];
      return {
        daily,
        computedAt: cached?.computedAt as string | undefined,
        factors: (cached?.payload?.seasonalFactors?.[store] ?? null) as (number | null)[] | null,
        monthly: (cached?.payload?.monthly?.[store] ?? []) as { ym: string; days: number; supplyPerDay: number }[],
      };
    } catch {
      return null;
    }
  };

  // 품목(pos_items) — 상품 비중·커피 잔수. 뷰가 없으면 조용히 빈 배열.
  const loadItems = async () =>
    fetchAllRows<{ ym: string; category: string; product: string; qty: number; gross: number }>(
      (from, to) => {
        let q = supabase
          .schema('finance')
          .from('dashboard_pos_items')
          .select('ym,category,product,qty,gross')
          .eq('brand', unit.brand)
          .order('ym')
          .order('category')
          .order('product')
          .range(from, to);
        if (unit.store) q = q.eq('store', unit.store);
        return q;
      },
      { page: 20000, label: '품목', missingTableOk: true },
    ).catch(() => []);

  const [weather, items] = await Promise.all([loadWeather(), loadItems()]);
  const imp = weather ? simpleImpact(weather.daily, isKrHoliday) : null;

  // 그램 상품(브런치바)의 도입 효과 — 도입 월 = 첫 판매가 있는 달
  const gramProduct = GRAM_PRODUCTS.find((r) => r.brand === unit.brand && (r.store === '' || r.store === store))?.product ?? null;
  const byYm = new Map<string, { total: number; product: number; coffeeQty: number }>();
  for (const it of items) {
    const a = byYm.get(it.ym) ?? { total: 0, product: 0, coffeeQty: 0 };
    a.total += Number(it.gross);
    if (gramProduct && it.product === gramProduct) a.product += Number(it.gross);
    if (/coffee/i.test(it.category)) a.coffeeQty += Number(it.qty);
    byYm.set(it.ym, a);
  }
  const yms = Array.from(byYm.keys()).sort();
  const firstProductYm = yms.find((ym) => (byYm.get(ym)?.product ?? 0) > 0) ?? null;
  const daysOf = (ym: string) => weather?.monthly.find((m) => m.ym === ym)?.days ?? 0;
  const avg = (list: string[], pick: (a: { total: number; coffeeQty: number }) => number) => {
    const d = list.reduce((s, ym) => s + daysOf(ym), 0);
    const v = list.reduce((s, ym) => s + pick(byYm.get(ym)!), 0);
    return d > 0 ? v / d : 0;
  };
  const beforeYms = firstProductYm ? yms.filter((ym) => ym < firstProductYm) : [];
  const afterYms = firstProductYm ? yms.filter((ym) => ym >= firstProductYm) : [];
  const lastYm = yms[yms.length - 1] ?? '';

  const cards: HypothesisCard[] = [
    rainHypothesis(imp),
    niceWeatherHypothesis(imp),
    holidayHypothesis(imp),
    seasonHypothesis(weather?.factors ? { factors: weather.factors, monthly: weather.monthly } : null),
    gramProduct && firstProductYm && lastYm
      ? productShareHypothesis({
          product: gramProduct,
          ym: lastYm,
          productGross: byYm.get(lastYm)?.product ?? 0,
          totalGross: byYm.get(lastYm)?.total ?? 0,
          storeDailyBefore: avg(beforeYms, (a) => a.total),
          storeDailyAfter: avg(afterYms, (a) => a.total),
        })
      : null,
    gramProduct && beforeYms.length > 0 && afterYms.length > 0
      ? cannibalHypothesis({
          product: gramProduct,
          cupsBefore: avg(beforeYms, (a) => a.coffeeQty),
          cupsAfter: avg(afterYms, (a) => a.coffeeQty),
          salesBefore: avg(beforeYms, (a) => a.total),
          salesAfter: avg(afterYms, (a) => a.total),
        })
      : null,
  ].filter((c): c is HypothesisCard => c !== null);

  const counts = cards.reduce<Record<string, number>>((m, c) => ({ ...m, [c.verdict]: (m[c.verdict] ?? 0) + 1 }), {});

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">가설</h1>
          <Link href={`/finance/metrics?unit=${unit.id}`} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            지표로 →
          </Link>
        </div>
        <p className="mb-5 max-w-[820px] text-[13px] text-muted-foreground">
          <b>{unit.label}</b> — 현장에서 “이럴 것이다”라고 믿는 것을 우리 데이터로 확인하는 곳이에요. 결론은
          사람이 적지 않고 <b>매번 숫자에서 다시 만들어요</b> — 자료가 쌓이면 판정이 바뀝니다. 그래서 카드마다
          <b> 한계</b>를 같이 적어요.
          {weather?.computedAt && <> 날씨 계산 기준일 {weather.computedAt.slice(0, 10)}.</>}
        </p>

        {cards.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/40 px-4 py-6 text-[13px] text-muted-foreground">
            이 단위에는 아직 검증할 자료가 없어요. 가든 지점은 <Link href="/garden/weather" className="underline">날씨 분석</Link>을
            한 번 열어 계산을 돌리면 카드가 생겨요.
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-md bg-muted/40 px-4 py-3 text-[13px]">
              {(['refuted', 'confirmed', 'mixed', 'insufficient'] as Verdict[])
                .filter((v) => counts[v])
                .map((v) => (
                  <span key={v}>
                    {VERDICT_LABEL[v]} <b className="tabular-nums">{counts[v]}</b>건
                  </span>
                ))}
              <span className="text-muted-foreground">체감이 데이터와 어긋난 게 {counts.refuted ?? 0}건이에요.</span>
            </div>

            <div className="flex flex-col gap-4">
              {cards.map((c) => (
                <section key={c.id} className="rounded-md border border-border p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${BADGE[c.verdict]}`}>{VERDICT_LABEL[c.verdict]}</span>
                    <h2 className="m-0 text-[16px] font-medium">“{c.claim}”</h2>
                    <span className="text-[12px] text-muted-foreground">{c.origin}</span>
                  </div>
                  <p className="m-0 mb-4 text-[14px]">{c.headline}</p>
                  <div className="mb-4 overflow-hidden rounded-md border border-border">
                    <table className="w-full border-collapse text-[13px]">
                      <tbody>
                        {c.numbers.map((n) => (
                          <tr key={n.label} className="border-b border-border/50 last:border-0">
                            <td className="px-3 py-1.5 text-muted-foreground">{n.label}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{n.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[12px]">
                    {c.rule && (
                      <p className="m-0">
                        <b className="text-foreground">그래서 </b>
                        <span className="text-muted-foreground">{c.rule}</span>
                      </p>
                    )}
                    {c.limit && (
                      <p className="m-0">
                        <b className="text-foreground">한계 </b>
                        <span className="text-muted-foreground">{c.limit}</span>
                      </p>
                    )}
                    <p className="m-0 text-muted-foreground/70">방법 — {c.method}</p>
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const metadata = { title: '가설' };
