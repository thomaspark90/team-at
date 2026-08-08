// Open-Meteo 16일 예보 조회 — 날씨 스트립(클라이언트)과 주간 브리핑 크론(서버)이 공유하는
// 동형(fetch만 사용) 모듈. 좌표·영업시간대 강수확률 규칙을 한 곳에서 관리한다.

// 판교·양재천 중간 좌표 — 두 매장은 직선 8km라 예보가 사실상 동일
export const GARDEN_LAT = 37.43;
export const GARDEN_LON = 127.07;

// 강수확률은 영업시간대(11–20시) 최대 — 일 최대는 새벽 소나기까지 잡혀
// '강수량 0mm · 확률 97%' 같은 혼란을 만든다(2026-08-08 대표 지적). 매장 판단엔 낮 시간이 중요.
export const BIZ_START = 11;
export const BIZ_END = 20;

const API =
  `https://api.open-meteo.com/v1/forecast?latitude=${GARDEN_LAT}&longitude=${GARDEN_LON}` +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean' +
  '&hourly=precipitation_probability&forecast_days=16&timezone=Asia%2FSeoul';

export interface ForecastDay {
  ymd: string; // 'YYYY-MM-DD'
  code: number; // WMO weather code
  tMax: number;
  tMin: number;
  feelMax: number;
  rainMm: number;
  rainProb: number | null; // 영업시간대(11–20시) 최대 강수확률
  windMax: number | null;
  humidity: number | null;
}

export const wmoLabel = (code: number): string => {
  if (code === 0) return '맑음';
  if (code === 1) return '대체로 맑음';
  if (code === 2) return '구름 조금';
  if (code === 3) return '흐림';
  if (code === 45 || code === 48) return '안개';
  if (code >= 51 && code <= 57) return '이슬비';
  if (code >= 61 && code <= 67) return '비';
  if (code >= 71 && code <= 77) return '눈';
  if (code >= 80 && code <= 82) return '소나기';
  if (code === 85 || code === 86) return '소낙눈';
  if (code >= 95) return '뇌우';
  return '—';
};

export const isSnowCode = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86;
export const isRainCode = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;

/** 예보 조회 + 일 단위 매핑. 실패 시 throw — 표시 정책(숨김/유지)은 호출부가 정한다. */
export async function fetchForecastDays(): Promise<ForecastDay[]> {
  const r = await fetch(API);
  if (!r.ok) throw new Error(`예보 조회 실패 (${r.status})`);
  const j = await r.json();

  // 날짜별 영업시간대 최대 강수확률
  const bizProb = new Map<string, number>();
  const h = j.hourly;
  for (let i = 0; i < (h?.time?.length ?? 0); i++) {
    const hour = Number(h.time[i].slice(11, 13));
    if (hour < BIZ_START || hour > BIZ_END) continue;
    const p = h.precipitation_probability[i];
    if (p == null) continue;
    const date = h.time[i].slice(0, 10);
    bizProb.set(date, Math.max(bizProb.get(date) ?? 0, p));
  }

  const d = j.daily;
  const out: ForecastDay[] = [];
  for (let i = 0; i < d.time.length; i++) {
    // 마지막 날은 모델 커버리지에 따라 값이 비기도 함 — 핵심값 없으면 제외
    if (d.temperature_2m_max[i] == null || d.weather_code[i] == null) continue;
    out.push({
      ymd: d.time[i],
      code: d.weather_code[i],
      tMax: d.temperature_2m_max[i],
      tMin: d.temperature_2m_min[i],
      feelMax: d.apparent_temperature_max[i] ?? d.temperature_2m_max[i],
      rainMm: d.precipitation_sum[i] ?? 0,
      rainProb: bizProb.get(d.time[i]) ?? d.precipitation_probability_max[i],
      windMax: d.wind_speed_10m_max[i],
      humidity: d.relative_humidity_2m_mean[i],
    });
  }
  return out;
}
