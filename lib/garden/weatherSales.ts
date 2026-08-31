// 날씨 × 판매 상관 분석 — 순수 계산 모듈 (API 라우트에서 사용).
// 모델: ln(일 판매) ~ 기온밴드 + 강수밴드 + 공휴일 + 요일 + 선형 트렌드 (OLS).
// 밴드 더미를 쓰는 이유: "기온 1°당 x%" 선형 가정 없이 구간별 효과를 그대로 보여주기 위해.
// 공휴일 더미: 명절·연휴가 특정 계절(겨울 설, 가을 추석)에 몰려 기온 계수를 왜곡하는 것을 막는다.
// 기준(레퍼런스) = 일최고 10–20° · 비 안 온 날(<1mm) · 평일 월요일.
import { isKrHoliday } from './krHolidays';

// 분석 결과 캐시 경로 — API 라우트(읽기·쓰기)와 POS 업로드(무효화)가 공유
export const WEATHER_SALES_CACHE_PATH = 'data/garden-weather-sales-cache.json';

export interface WeatherDay {
  date: string; // 'YYYY-MM-DD'
  tmax: number;
  rainMm: number;
}

export interface SalesDay {
  date: string;
  y: number; // 분석 대상 값(잔수·건수·공급가액) — 0 이하는 휴무로 간주하고 제외
}

export interface BandEffect {
  band: string; // 'temp:30+' 등
  label: string; // '30° 이상'
  pct: number; // 기준 대비 % (exp(b)−1)
  t: number; // t-통계량 — |t|≥2 면 통상 유의
  n: number; // 해당 밴드 관측일수
}

export interface RegressionResult {
  n: number;
  r2: number;
  /** 기온 기준 밴드 라벨(관측 최다 밴드 자동 선택) — 효과는 이 밴드 대비 % */
  tempRef: string;
  temp: BandEffect[];
  rain: BandEffect[];
  /** 트렌드: 기간 처음→끝 기준 % 변화 (신규 매장 성장 등) */
  trendPct: number;
  trendT: number;
  /** 공휴일 효과 — 표본에 공휴일이 3일 미만이면 null(통제 불가) */
  holidayPct: number | null;
  holidayT: number | null;
}

// 기온 밴드 전체 — 기준(레퍼런스)은 표본에서 관측일이 가장 많은 밴드를 자동 선택한다.
// 고정 기준(10–20°)을 쓰면 여름만 있는 표본(양재천)에선 기준일이 2일뿐이라 모든 계수가 불안정해진다(2026-08-08 실측).
const TEMP_BANDS: { key: string; label: string; test: (t: number) => boolean }[] = [
  { key: 'temp:<0', label: '영하', test: (t) => t < 0 },
  { key: 'temp:0-10', label: '0–10°', test: (t) => t >= 0 && t < 10 },
  { key: 'temp:10-20', label: '10–20°', test: (t) => t >= 10 && t < 20 },
  { key: 'temp:20-25', label: '20–25°', test: (t) => t >= 20 && t < 25 },
  { key: 'temp:25-30', label: '25–30°', test: (t) => t >= 25 && t < 30 },
  { key: 'temp:30+', label: '30° 이상', test: (t) => t >= 30 },
];

const RAIN_BANDS: { key: string; label: string; test: (mm: number) => boolean }[] = [
  // <1mm = 기준
  { key: 'rain:1-5', label: '비 1–5mm', test: (mm) => mm >= 1 && mm < 5 },
  { key: 'rain:5-20', label: '비 5–20mm', test: (mm) => mm >= 5 && mm < 20 },
  { key: 'rain:20+', label: '비 20mm+', test: (mm) => mm >= 20 },
];

// ---------- 선형대수: 정규방정식 XᵀX b = Xᵀy 풀이 + (XᵀX)⁻¹ (가우스 소거) ----------
function solveWithInverse(A: number[][], b: number[]): { x: number[]; inv: number[][] } | null {
  const k = A.length;
  // [A | I | b] 확대행렬
  const M = A.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)), b[i]]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-9) return null; // 특이행렬 — 밴드 관측 부족
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let j = c; j <= 2 * k; j++) M[c][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f === 0) continue;
      for (let j = c; j <= 2 * k; j++) M[r][j] -= f * M[c][j];
    }
  }
  return {
    x: M.map((row) => row[2 * k]),
    inv: M.map((row) => row.slice(k, 2 * k)),
  };
}

/** 판매 시계열 × 날씨 → 밴드 효과 회귀. 표본이 부족하면 null. */
export function regressWeather(sales: SalesDay[], weather: Map<string, WeatherDay>): RegressionResult | null {
  // 조인 + 휴무(0 이하) 제외
  const obs = sales
    .filter((s) => s.y > 0)
    .map((s) => ({ ...s, w: weather.get(s.date) }))
    .filter((s): s is typeof s & { w: WeatherDay } => !!s.w)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (obs.length < 40) return null; // 최소 표본 — 더미 수 대비 여유

  // 기온 기준 밴드 = 관측 최다 밴드. 나머지 중 관측 있는 밴드만 컬럼으로 (0관측 더미는 특이행렬을 만든다)
  const tempCounts = TEMP_BANDS.map((band) => ({ ...band, n: obs.filter((o) => band.test(o.w.tmax)).length }));
  const tempRef = tempCounts.reduce((best, b) => (b.n > best.n ? b : best), tempCounts[0]);
  const tempCols = tempCounts.filter((band) => band.key !== tempRef.key && band.n >= 3);
  const rainCols = RAIN_BANDS.map((band) => ({ ...band, n: obs.filter((o) => band.test(o.w.rainMm)).length })).filter(
    (band) => band.n >= 3,
  );

  // 공휴일 더미 — 표본에 3일 미만이면 컬럼 제외(특이행렬 방지)
  const holidayN = obs.filter((o) => isKrHoliday(o.date)).length;
  const useHoliday = holidayN >= 3;

  // 컬럼: 절편 + 기온밴드 + 강수밴드 + (공휴일) + 요일(화~일, 월=기준) + 트렌드(0→1)
  const labels = [
    '절편',
    ...tempCols.map((c) => c.key),
    ...rainCols.map((c) => c.key),
    ...(useHoliday ? ['holiday'] : []),
    'dow:2', 'dow:3', 'dow:4', 'dow:5', 'dow:6', 'dow:0',
    'trend',
  ];
  const X = obs.map((o, i) => {
    const dow = new Date(o.date + 'T00:00:00Z').getUTCDay();
    return [
      1,
      ...tempCols.map((c) => (c.test(o.w.tmax) ? 1 : 0)),
      ...rainCols.map((c) => (c.test(o.w.rainMm) ? 1 : 0)),
      ...(useHoliday ? [isKrHoliday(o.date) ? 1 : 0] : []),
      ...[2, 3, 4, 5, 6, 0].map((d) => (dow === d ? 1 : 0)),
      i / Math.max(1, obs.length - 1),
    ];
  });
  const y = obs.map((o) => Math.log(o.y));

  const k = labels.length;
  const XtX = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b2) => X.reduce((s, row) => s + row[a] * row[b2], 0)));
  const Xty = Array.from({ length: k }, (_, a) => X.reduce((s, row, i) => s + row[a] * y[i], 0));
  const solved = solveWithInverse(XtX, Xty);
  if (!solved) return null;
  const { x: beta, inv } = solved;

  const resid = y.map((yi, i) => yi - X[i].reduce((s, v, j) => s + v * beta[j], 0));
  const sse = resid.reduce((s, r) => s + r * r, 0);
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  const sst = y.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  const sigma2 = sse / Math.max(1, obs.length - k);
  const se = (j: number) => Math.sqrt(Math.max(0, sigma2 * inv[j][j]));

  const effectAt = (j: number, n: number, label: string, band: string): BandEffect => ({
    band,
    label,
    pct: (Math.exp(beta[j]) - 1) * 100,
    t: se(j) > 0 ? beta[j] / se(j) : 0,
    n,
  });

  let j = 1;
  const temp = tempCols.map((c) => effectAt(j++, c.n, c.label, c.key));
  const rain = rainCols.map((c) => effectAt(j++, c.n, c.label, c.key));
  const jHoliday = useHoliday ? j++ : -1;
  const jTrend = k - 1;

  return {
    n: obs.length,
    r2: sst > 0 ? 1 - sse / sst : 0,
    tempRef: tempRef.label,
    temp,
    rain,
    trendPct: (Math.exp(beta[jTrend]) - 1) * 100,
    trendT: se(jTrend) > 0 ? beta[jTrend] / se(jTrend) : 0,
    holidayPct: jHoliday >= 0 ? (Math.exp(beta[jHoliday]) - 1) * 100 : null,
    holidayT: jHoliday >= 0 && se(jHoliday) > 0 ? beta[jHoliday] / se(jHoliday) : null,
  };
}

// ---------- Open-Meteo 과거 날씨 (Archive API, 무료·키 불필요) ----------
// 판교·양재천 중간 좌표 — WeatherStrip 과 동일 기준.
const LAT = 37.43;
const LON = 127.07;

export async function fetchWeatherArchive(start: string, end: string): Promise<Map<string, WeatherDay>> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}` +
    `&start_date=${start}&end_date=${end}` +
    '&daily=temperature_2m_max,precipitation_sum&timezone=Asia%2FSeoul';
  const r = await fetch(url, { next: { revalidate: 3600 } });
  if (!r.ok) throw new Error(`날씨 아카이브 조회 실패 (${r.status})`);
  const j = await r.json();
  const map = new Map<string, WeatherDay>();
  const d = j.daily;
  for (let i = 0; i < d.time.length; i++) {
    if (d.temperature_2m_max[i] == null) continue;
    map.set(d.time[i], { date: d.time[i], tmax: d.temperature_2m_max[i], rainMm: d.precipitation_sum[i] ?? 0 });
  }
  return map;
}

// ── 가정 최소 분석: 요일×월 중앙값 대비 지수 (2026-08-31) ──────────────────
// 회귀(위)는 로그 종속변수라 큰 하락일 하나에 크게 끌려가고, 장마처럼 특정 달에 몰린 조건은
// 그 달의 부진까지 흡수한다. 실제로 2026-08-31 검증에서 회귀는 폭우 −29%로 봤지만, 같은 달·같은
// 요일과만 비교하면 −19%였고 폭우 11일 중 2일은 평소와 같았다. 그래서 **판단용 숫자는 이쪽**을 쓴다.
//   지수 = 그날 매출 ÷ (같은 달·같은 요일 매출의 중앙값)   → 1.00 = 그 요일 평소 수준
// 계절·요일·성장 추세가 자동으로 빠지고, 남는 건 "같은 달 안에서 그날이 특별했는가"뿐이다.
// ⚠ 한계: 어떤 조건이 **같은 달의 같은 요일에 몰리면** 중앙값 자체가 내려가 효과가 지워진다
//   (테스트로 고정). 밴드 지수는 '같은 달·같은 요일에 비교 대상이 있을 때'만 의미가 있다.

export interface DayPoint {
  date: string;
  rain: number;
  tmax: number | null;
  sales: number;
}

export interface BandIndex {
  label: string;
  n: number;
  index: number; // 1.00 = 평소
  pct: number; // (index − 1) × 100
}

export interface SimpleImpact {
  rain: BandIndex[];
  temp: BandIndex[];
  calendar: BandIndex[];
  /** 폭우(20mm+)로 잃은 것으로 추정되는 매출 합계와 기간 총매출 대비 비중 */
  heavyRainLoss: { won: number; pctOfTotal: number; days: number };
  totalSales: number;
  days: number;
}

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * @param isHoliday 공휴일 판정(호출부에서 KR_HOLIDAYS 주입 — 이 모듈을 달력에 묶지 않으려고)
 */
export function simpleImpact(days: DayPoint[], isHoliday: (ymd: string) => boolean): SimpleImpact | null {
  const rows = days.filter((d) => d.sales > 0);
  if (rows.length < 20) return null; // 표본이 너무 적으면 지수가 튄다

  const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const shift = (d: string, n: number) =>
    new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const k = `${r.date.slice(0, 7)}|${dow(r.date)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r.sales);
  }
  const idx = rows.map((r) => {
    const m = median(groups.get(`${r.date.slice(0, 7)}|${dow(r.date)}`)!);
    return { ...r, i: m > 0 ? r.sales / m : 1 };
  });

  // 밴드 대표값은 **중앙값**. 평균을 쓰면 하루가 밴드를 만든다 — 판교 '공휴일 전날'이 크리스마스
  // 이브(지수 4.08) 하나 때문에 평균 +24.6%로 뜨는데, 중앙값으로는 −11%다(2026-08-31 실측).
  // 우리가 회귀를 신뢰하지 않기로 한 이유와 같은 이유로 여기서도 이상치에 끌려가면 안 된다.
  const band = (label: string, test: (r: (typeof idx)[number]) => boolean): BandIndex | null => {
    const sel = idx.filter(test);
    if (sel.length < 3) return null; // 3일 미만은 숫자로 안 내놓는다
    const m = median(sel.map((r) => r.i));
    return { label, n: sel.length, index: +m.toFixed(3), pct: +((m - 1) * 100).toFixed(1) };
  };
  const keep = (arr: (BandIndex | null)[]) => arr.filter((b): b is BandIndex => b !== null);

  const rainBands = keep([
    band('비 안 옴(<1mm)', (r) => r.rain < 1),
    band('비 1–5mm', (r) => r.rain >= 1 && r.rain < 5),
    band('비 5–20mm', (r) => r.rain >= 5 && r.rain < 20),
    band('폭우 20mm+', (r) => r.rain >= 20),
  ]);
  const tempBands = keep([
    band('영하', (r) => r.tmax != null && r.tmax < 0),
    band('0–10°', (r) => r.tmax != null && r.tmax >= 0 && r.tmax < 10),
    band('10–18°', (r) => r.tmax != null && r.tmax >= 10 && r.tmax < 18),
    band('18–24°(쾌적)', (r) => r.tmax != null && r.tmax >= 18 && r.tmax < 24),
    band('24–28°', (r) => r.tmax != null && r.tmax >= 24 && r.tmax < 28),
    band('28–34°', (r) => r.tmax != null && r.tmax >= 28 && r.tmax < 34),
    band('폭염 34°+', (r) => r.tmax != null && r.tmax >= 34),
  ]);
  const calBands = keep([
    band('공휴일 당일', (r) => isHoliday(r.date)),
    band('공휴일 전날', (r) => !isHoliday(r.date) && isHoliday(shift(r.date, 1))),
    band('공휴일 다음날', (r) => !isHoliday(r.date) && isHoliday(shift(r.date, -1))),
    band('평범한 날', (r) => !isHoliday(r.date) && !isHoliday(shift(r.date, 1)) && !isHoliday(shift(r.date, -1))),
  ]);

  // 폭우 손실 = Σ(평소 수준 − 실제). 평소 수준 = 실제 ÷ 지수.
  const heavy = idx.filter((r) => r.rain >= 20);
  const lost = heavy.reduce((s, r) => s + (r.i > 0 ? r.sales / r.i - r.sales : 0), 0);
  const total = idx.reduce((s, r) => s + r.sales, 0);

  return {
    rain: rainBands,
    temp: tempBands,
    calendar: calBands,
    heavyRainLoss: {
      won: Math.round(lost),
      pctOfTotal: total > 0 ? +((lost / total) * 100).toFixed(1) : 0,
      days: heavy.length,
    },
    totalSales: Math.round(total),
    days: idx.length,
  };
}
