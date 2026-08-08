// 날씨 → 판매 영향 계수 — /garden/weather 회귀에서 유의(|t|≥2)하게 확인된 것만 옮겨 적는다.
// 스트립 코멘트의 숫자 예측이 이 값을 쓴다. 데이터가 늘면 '다시 계산' 후 갱신할 것.
//
// 2026-08-08 v3 — 두 지점 확정 (판교 2025-10~2026-08 299일 + 양재천 5–7월 74일,
// 요일/공휴일/트렌드 통제):
//   비 20mm+(폭우): 판교 매출 −33%(t=−4.0)·건수 −31%(t=−4.6) / 양재천 매출 −29%(t=−4.5)·잔수 −23%(t=−3.3)
//   비 5–20mm: 판교 0%(무영향) / 양재천 −10%(경계) — 약한 비는 영향 작음
//   겨울: 판교 영하 매출 −37%(t=−6.0)·건수 −38%(t=−7.9), 0–10° −31~−35%(t=−6.6~−9.6)
//   여름: 20–25° 대비 25–30° 평탄, 30°+ 판교 매출 −16%(t=−1.9 경계)·건수 평탄
//   공휴일: 판교 건수 −19%(t=−2.7) — 오피스 상권 특성. 양재천은 불유의
//   양재천 잔수: 20–25° −15%(t=−2.3) — 여름 구간에선 더울수록 잘 팔림

export const IMPACT_ESTIMATED_AT = '2026-08-08';
export const IMPACT_BASIS = '판교 25.10~26.8 · 양재천 5–7월 실측';

/** 폭우(20mm+) 예보일의 예상 매출 영향 문구 — 두 지점 −29~−33% 일치 */
export const HEAVY_RAIN_IMPACT_LABEL = '예상 매출 −30% 안팎';

/** 일반 비(확률 60%+ 등, 강수량 불확실) 예보일의 예상 영향 문구 — 강도 따라 0~−30% */
export const RAIN_IMPACT_LABEL = '예상 매출 −10~30% (강도 따라)';

/** 영하권 예상 영향 문구 — 판교 실측 −37~−38% */
export const COLD_IMPACT_LABEL = '예상 매출 −30~40%';

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
