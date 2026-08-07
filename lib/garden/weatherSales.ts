// 날씨 × 판매 상관 분석 — 순수 계산 모듈 (API 라우트에서 사용).
// 모델: ln(일 판매) ~ 기온밴드 + 강수밴드 + 요일 + 선형 트렌드 (OLS).
// 밴드 더미를 쓰는 이유: "기온 1°당 x%" 선형 가정 없이 구간별 효과를 그대로 보여주기 위해.
// 기준(레퍼런스) = 일최고 10–20° · 비 안 온 날(<1mm) · 월요일.

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
  temp: BandEffect[];
  rain: BandEffect[];
  /** 트렌드: 기간 처음→끝 기준 % 변화 (신규 매장 성장 등) */
  trendPct: number;
  trendT: number;
}

const TEMP_BANDS: { key: string; label: string; test: (t: number) => boolean }[] = [
  { key: 'temp:<0', label: '영하', test: (t) => t < 0 },
  { key: 'temp:0-10', label: '0–10°', test: (t) => t >= 0 && t < 10 },
  // 10–20° = 기준(더미 없음)
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

  // 관측 있는 밴드만 컬럼으로 (0관측 더미는 특이행렬을 만든다)
  const tempCols = TEMP_BANDS.map((band) => ({ ...band, n: obs.filter((o) => band.test(o.w.tmax)).length })).filter(
    (band) => band.n >= 3,
  );
  const rainCols = RAIN_BANDS.map((band) => ({ ...band, n: obs.filter((o) => band.test(o.w.rainMm)).length })).filter(
    (band) => band.n >= 3,
  );

  // 컬럼: 절편 + 기온밴드 + 강수밴드 + 요일(화~일, 월=기준) + 트렌드(0→1)
  const labels = ['절편', ...tempCols.map((c) => c.key), ...rainCols.map((c) => c.key), 'dow:2', 'dow:3', 'dow:4', 'dow:5', 'dow:6', 'dow:0', 'trend'];
  const X = obs.map((o, i) => {
    const dow = new Date(o.date + 'T00:00:00+09:00').getDay();
    return [
      1,
      ...tempCols.map((c) => (c.test(o.w.tmax) ? 1 : 0)),
      ...rainCols.map((c) => (c.test(o.w.rainMm) ? 1 : 0)),
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
  const jTrend = k - 1;

  return {
    n: obs.length,
    r2: sst > 0 ? 1 - sse / sst : 0,
    temp,
    rain,
    trendPct: (Math.exp(beta[jTrend]) - 1) * 100,
    trendT: se(jTrend) > 0 ? beta[jTrend] / se(jTrend) : 0,
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
