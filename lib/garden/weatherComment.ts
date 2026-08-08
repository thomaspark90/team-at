// 예보에서 발주 판단에 유의미한 신호를 골라 한 줄 문장으로 — 날씨 스트립 위에 표시.
// 계수(날씨×판매 회귀)가 확정되기 전까지는 % 예측 없이 방향성 문장만 만든다.
import { KR_HOLIDAYS } from './krHolidays';
import { isSnowCode } from './weatherForecast';
import { IMPACT_BASIS, RAIN_IMPACT_LABEL } from './weatherImpact';

export interface ForecastDay {
  ymd: string; // 'YYYY-MM-DD'
  code: number; // WMO weather code
  tMax: number;
  feelMax: number;
  rainMm: number;
  rainProb: number | null;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dowOf = (ymd: string) => new Date(ymd + 'T00:00:00Z').getUTCDay();
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const isDayOff = (ymd: string) => dowOf(ymd) === 0 || dowOf(ymd) === 6 || KR_HOLIDAYS.has(ymd);

/** 향후 8일에서 신호 추출 — 우선순위 순으로 최대 2개. */
export function buildWeatherComments(days: ForecastDay[]): string[] {
  const week = days.slice(0, 8);
  const out: string[] = [];

  // 1) 주말·공휴일 비 — 매출 집중일이라 가장 중요. 유의 계수 확인분(비 5–20mm → 매출 −18%)을 잠정 수치로 병기
  const offRain = week.filter((d) => isDayOff(d.ymd) && (d.rainProb ?? 0) >= 60);
  if (offRain.length > 0) {
    const list = offRain.map((d) => `${md(d.ymd)}(${DOW[dowOf(d.ymd)]}${KR_HOLIDAYS.has(d.ymd) ? '·휴' : ''}) ${d.rainProb}%`).join(' · ');
    out.push(`주말·휴일 비 예보 — ${list} · ${RAIN_IMPACT_LABEL} (${IMPACT_BASIS})`);
  }

  // 2) 눈 — 겨울 방문 감소엔 영하보다 직접적인 신호
  const snow = week.filter((d) => isSnowCode(d.code));
  if (snow.length > 0) {
    out.push(`눈 예보 — ${snow.slice(0, 3).map((d) => `${md(d.ymd)}(${DOW[dowOf(d.ymd)]})`).join(' · ')} · 방문 감소 예상`);
  }

  // 3) 강한 비(20mm+) — 평일이라도 유의미
  const heavy = week.filter((d) => d.rainMm >= 20);
  if (heavy.length > 0) {
    out.push(`강한 비 — ${heavy.map((d) => `${md(d.ymd)} ${Math.round(d.rainMm)}mm`).join(' · ')} · ${RAIN_IMPACT_LABEL} (${IMPACT_BASIS})`);
  }

  // 4) 폭염 지속 — 체감 33°+ 가 3일 이상 이어지면
  let streak = 0;
  let heatDone = false;
  for (const d of week) {
    streak = d.feelMax >= 33 ? streak + 1 : 0;
    if (streak >= 3 && !heatDone) {
      out.push('체감 33°+ 사흘 이상 지속 — 아이스 음료 수요 증가 예상');
      heatDone = true;
    }
  }

  // 5) 영하권 — 겨울 방문 감소 신호
  const cold = week.filter((d) => d.tMax <= 0);
  if (cold.length > 0) {
    out.push(`일최고 영하 ${cold.length}일(${cold.slice(0, 3).map((d) => md(d.ymd)).join('·')}) — 방문 감소·핫 음료 편중 예상`);
  }

  return out.slice(0, 2);
}
