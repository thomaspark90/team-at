import type { StoreId } from '@/lib/types';

// 지점별 필터커피 판매가 (2026-11-19 대표 지시, 2026-11-24 구간제로 변경).
// 책정 판매가(발주 기록 chosenPrice)는 양재천 기준 하나만 저장하고, 판교는 거기서 구간별로 낮춰 판다.
// 판교 값은 따로 저장하지 않는 파생값 — 양재천 판매가를 고치면 판교도 같이 움직인다.
// 금액은 모두 VAT 포함 소비자가(원).
//
// 판교 구간 (2026-11-24 대표 지시 — 판교도 7,000원 밑으로 내려가면 안 된다):
//   양재천 8,500원 이상 → −1,000원
//   양재천 7,500원 이상 → −500원
//   그 아래(7,000원 이하) → 양재천과 동일
type PriceTier = { from: number; offset: number };

/** 지점별 차액 구간 — from(양재천 기준가, 이상) 내림차순. 어느 구간에도 안 걸리면 차액 0 */
export const STORE_PRICE_TIERS: Record<StoreId, PriceTier[]> = {
  yangjae: [],
  pangyo: [
    { from: 8500, offset: -1000 },
    { from: 7500, offset: -500 },
  ],
};

/** 양재천 기준가에 그 지점이 적용하는 차액(원). 판교 8,500원 이상 −1,000 · 7,500원 이상 −500 · 그 아래 0 */
export function storePriceOffset(basePrice: number, store: StoreId): number {
  return STORE_PRICE_TIERS[store].find((t) => basePrice >= t.from)?.offset ?? 0;
}

/** 그 지점의 판매가 — 양재천 기준가 + 구간별 지점 차액. 미책정(null·0 이하)이면 null */
export function storePrice(basePrice: number | null | undefined, store: StoreId): number | null {
  if (basePrice == null || basePrice <= 0) return null;
  return basePrice + storePriceOffset(basePrice, store);
}

/** 양재천 대비 차액 문구 — 미책정이거나 차액이 없으면 null. 예: '양재천 −1,000원' */
export function storePriceNote(basePrice: number | null | undefined, store: StoreId): string | null {
  if (basePrice == null || basePrice <= 0) return null;
  const d = storePriceOffset(basePrice, store);
  if (!d) return null;
  return `양재천 ${d < 0 ? '−' : '+'}${Math.abs(d).toLocaleString('ko-KR')}원`;
}
