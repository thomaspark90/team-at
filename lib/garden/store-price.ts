import type { StoreId } from '@/lib/types';

// 지점별 필터커피 판매가 (2026-11-19 대표 지시).
// 책정 판매가(발주 기록 chosenPrice)는 양재천 기준 하나만 저장하고, 판교는 거기서 1,000원 낮춰 판다.
// 판교 값은 따로 저장하지 않는 파생값 — 양재천 판매가를 고치면 판교도 같이 움직인다.
// 금액은 모두 VAT 포함 소비자가(원).
export const STORE_PRICE_OFFSET: Record<StoreId, number> = { yangjae: 0, pangyo: -1000 };

/** 그 지점의 판매가 — 양재천 기준가 + 지점 차액. 미책정(null·0 이하)이면 null, 0원 밑으로는 내려가지 않는다 */
export function storePrice(basePrice: number | null | undefined, store: StoreId): number | null {
  if (basePrice == null || basePrice <= 0) return null;
  return Math.max(0, basePrice + STORE_PRICE_OFFSET[store]);
}

/** 양재천 대비 차액 문구 — 차액이 없으면 null. 예: '양재천 −1,000원' */
export function storePriceNote(store: StoreId): string | null {
  const d = STORE_PRICE_OFFSET[store];
  if (!d) return null;
  return `양재천 ${d < 0 ? '−' : '+'}${Math.abs(d).toLocaleString('ko-KR')}원`;
}
