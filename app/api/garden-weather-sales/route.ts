import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fetchWeatherArchive, regressWeather, type RegressionResult, type SalesDay } from '@/lib/garden/weatherSales';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 날씨 × 판매 분석 — 가든 두 지점의 pos_sales 를 과거 날씨(Open-Meteo Archive)와 조인해
// 밴드 회귀 결과를 돌려준다. 미들웨어가 팀 계정을 확인한 뒤 들어오고,
// pos_sales 는 재무 역할(admin/classifier) RLS 라 여기서 역할을 명시적으로 확인해 안내한다.
//
// 지표 선택 이유:
//   양재천(토스) COFFEE qty = 품목행 수량 합 → 정확한 '잔수'.
//   판교(페이히어 요약)는 qty 가 결제건수(묶음 결제 1건 처리)라 잔수 대신 공급가액을 본다.

interface PosRow {
  sale_date: string;
  store: string;
  category: string;
  qty: number | string;
  supply: number | string;
}

interface SeriesOut {
  key: string;
  label: string;
  metric: string;
  result: RegressionResult | null;
}

const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, d: number) =>
  new Date(new Date(ymd + 'T00:00:00Z').getTime() + d * 86400_000).toISOString().slice(0, 10);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '재무 권한(admin/classifier)이 있어야 볼 수 있어요.' }, { status: 403 });
  }

  // 가든 POS 전체 — 페이지네이션으로 모두 수집
  const rows: PosRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .schema('finance')
      .from('pos_sales')
      .select('sale_date,store,category,qty,supply')
      .eq('brand', 'garden')
      .order('sale_date')
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: `POS 조회 실패: ${error.message}` }, { status: 500 });
    rows.push(...((data ?? []) as PosRow[]));
    if (!data || data.length < 1000) break;
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: '가든 POS 데이터가 없어요. 관리손익 탭에서 매출리포트를 먼저 업로드해주세요.' }, { status: 404 });
  }

  // (지점 × 일) 집계 + 지점별 카테고리 합계
  type Daily = { qty: number; supply: number };
  const byStore = new Map<string, Map<string, Daily>>(); // store → date → 합계
  const coffeeYangjae = new Map<string, number>(); // date → COFFEE qty
  const catTotals = new Map<string, Map<string, { qty: number; supply: number }>>();
  for (const r of rows) {
    const store = r.store || '-';
    const qty = Number(r.qty) || 0;
    const supply = Number(r.supply) || 0;
    const days = byStore.get(store) ?? new Map<string, Daily>();
    const d = days.get(r.sale_date) ?? { qty: 0, supply: 0 };
    d.qty += qty;
    d.supply += supply;
    days.set(r.sale_date, d);
    byStore.set(store, days);
    const cats = catTotals.get(store) ?? new Map();
    const c = cats.get(r.category) ?? { qty: 0, supply: 0 };
    c.qty += qty;
    c.supply += supply;
    cats.set(r.category, c);
    catTotals.set(store, cats);
    if (store === 'yangjae' && /coffee/i.test(r.category)) {
      coffeeYangjae.set(r.sale_date, (coffeeYangjae.get(r.sale_date) ?? 0) + qty);
    }
  }

  // 커버리지 — 지점별 기간·영업일수 + 누락 의심 월(중간에 15일 미만)
  const coverage = Array.from(byStore.entries()).map(([store, days]) => {
    const dates = Array.from(days.keys()).sort();
    const perYm = new Map<string, number>();
    for (const d of dates) perYm.set(d.slice(0, 7), (perYm.get(d.slice(0, 7)) ?? 0) + 1);
    const yms = Array.from(perYm.keys()).sort();
    const sparse = yms.slice(1, -1).filter((ym) => (perYm.get(ym) ?? 0) < 15); // 첫·끝 달은 부분월 허용
    return { store, from: dates[0], to: dates[dates.length - 1], days: dates.length, sparseMonths: sparse };
  });

  // 날씨: 전체 기간 ~ 아카이브 지연(약 5일) 감안한 끝
  const allDates = rows.map((r) => r.sale_date).sort();
  const start = allDates[0];
  const end = [allDates[allDates.length - 1], addDays(kstToday(), -6)].sort()[0];
  let weather;
  try {
    weather = await fetchWeatherArchive(start, end);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '날씨 조회 실패' }, { status: 502 });
  }

  const toSeries = (days: Map<string, Daily> | undefined, pick: (d: Daily) => number): SalesDay[] =>
    Array.from(days?.entries() ?? []).map(([date, d]) => ({ date, y: pick(d) }));

  const series: SeriesOut[] = [
    {
      key: 'pangyo-supply',
      label: '판교 · 일 매출(공급가액)',
      metric: '원',
      result: regressWeather(toSeries(byStore.get('pangyo'), (d) => d.supply), weather),
    },
    {
      key: 'pangyo-orders',
      label: '판교 · 일 결제건수',
      metric: '건',
      result: regressWeather(toSeries(byStore.get('pangyo'), (d) => d.qty), weather),
    },
    {
      key: 'yangjae-supply',
      label: '양재천 · 일 매출(공급가액)',
      metric: '원',
      result: regressWeather(toSeries(byStore.get('yangjae'), (d) => d.supply), weather),
    },
    {
      key: 'yangjae-coffee',
      label: '양재천 · 커피 잔수(COFFEE)',
      metric: '잔',
      result: regressWeather(
        Array.from(coffeeYangjae.entries()).map(([date, qty]) => ({ date, y: qty })),
        weather,
      ),
    },
  ];

  const categories = Object.fromEntries(
    Array.from(catTotals.entries()).map(([store, cats]) => [
      store,
      Array.from(cats.entries())
        .map(([category, v]) => ({ category, qty: Math.round(v.qty), supply: v.supply }))
        .sort((a, b) => b.supply - a.supply)
        .slice(0, 12),
    ]),
  );

  return NextResponse.json({ coverage, weatherDays: weather.size, series, categories });
}
