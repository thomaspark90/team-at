// 날씨 → 판매 영향 계수(잠정) — /garden/weather 회귀에서 유의(|t|≥2)하게 확인된 것만 옮겨 적는다.
// 스트립 코멘트의 숫자 예측이 이 값을 쓴다. 데이터가 늘면(판교 백필 등) 다시 계산해 갱신할 것.
//
// 2026-08-08 추정 v2 (양재천 5–7월 74일 · 장마 포함 · 기준 25–30°·비 없음 · 요일/공휴일/트렌드 통제):
//   비 20mm+(폭우): 매출 −29% (t=−4.5) · 커피 잔수 −23% (t=−3.3) — 강하게 유의
//   비 5–20mm: 매출 −10% (t=−1.7) — 경계 수준
//   20–25°(선선): 매출 −13% (t=−2.1) · 잔수 −15% (t=−2.3) — 여름 구간에선 더울수록 잘 팔림
//   30°+ 추가 효과 없음(평탄)
// 한계: 지점 1곳·여름 구간만 — '잠정' 표기 유지. 판교(2025-10~) 백필되면 겨울 구간까지 확정.

export const IMPACT_ESTIMATED_AT = '2026-08-08';
export const IMPACT_BASIS = '양재천 5–7월 실측·잠정';

/** 폭우(20mm+) 예보일의 예상 매출 영향 문구 — 실측 −29%(매출)·−23%(잔수) */
export const HEAVY_RAIN_IMPACT_LABEL = '예상 매출 −25~30%';

/** 일반 비(확률 60%+ 등, 강수량 불확실) 예보일의 예상 영향 문구 */
export const RAIN_IMPACT_LABEL = '예상 매출 −10~20%';

/** 선선한 날(일최고 20–25°, 여름 기준) 예상 영향 문구 */
export const COOL_IMPACT_LABEL = '예상 매출 −15% 안팎';

// ---------- 예상 잔수·원두 환산 (양재천) ----------
// 요일별 기준 잔수 — 분석 API baselines(최근 8주 COFFEE 평균, 2026-08-08 실측). 월요일 = 정기휴무.
// 갱신 방법: /garden/weather '다시 계산' 후 응답의 baselines.yangjaeCoffeeCupsByDow 로 교체.
export const YANGJAE_COFFEE_CUPS_BY_DOW = [261, 0, 158, 148, 144, 172, 235]; // 일~토

// 잔당 원두 투입량 — 발주 산식 기본값(PricingSettings.doseG 20g, ICE/HOT 평균)과 동일 가정
export const DOSE_G_PER_CUP = 20;

/** 날씨 → 잔수 배율. 유의 계수(잔수 기준)만 반영: 20–25° −15%, 비 20mm+ −23%, 5–20mm −8%. */
export function cupsWeatherFactor(day: { tMax: number; rainMm: number; rainProb: number | null }): number {
  let f = 1;
  if (day.tMax >= 20 && day.tMax < 25) f *= 0.85;
  if (day.rainMm >= 20) f *= 0.77;
  else if (day.rainMm >= 5) f *= 0.92;
  else if ((day.rainProb ?? 0) >= 60) f *= 0.88; // 양이 불확실한 비 예보 — 중간 추정
  return f;
}
