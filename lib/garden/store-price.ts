import type { StoreId } from '@/lib/types';

// 지점별 필터커피 판매가 (2026-11-19 대표 지시, 2026-11-24 구간제 + 산식표로 변경).
// 책정 판매가(발주 기록 chosenPrice)는 양재천 기준 하나만 저장하고, 판교는 거기서 산식표의 차액만큼 낮춰 판다.
// 판교 값은 따로 저장하지 않는 파생값 — 양재천 판매가를 고치면 판교도 같이 움직인다.
// 금액은 모두 VAT 포함 소비자가(원).
//
// 산식표 = 양재천 기준가(500원 단위 행)마다 판교 차액 하나. 원두 장부 [판매가] 블록의 '판교 가격 산식표'에서
// 칸을 눌러 고치고 서버에 저장한다(/api/garden-store-price). 저장값이 없으면 아래 기본 구간을 쓴다.
// 기본 구간 (2026-11-24 대표 지시 — 판교도 7,000원 밑으로 내려가면 안 된다):
//   양재천 8,500원 이상 → −1,000원 / 7,500원 이상 → −500원 / 그 아래(7,000원 이하) → 양재천과 동일

/** 산식표 세로축 — 양재천 기준가 5,000~15,000원(500원 단위). 축 밖 가격은 가장 가까운 끝 행을 따른다 */
export const OFFSET_PRICES = Array.from({ length: 21 }, (_, i) => 5000 + i * 500);
/** 산식표 가로축 — 고를 수 있는 판교 차액(원) */
export const OFFSET_OPTIONS = [0, -500, -1000, -1500, -2000];

/** 판교 차액표 — key = 양재천 기준가(원) 문자열, value = 차액(원, 0 이하) */
export type StoreOffsets = Record<string, number>;

const DEFAULT_TIERS = [
  { from: 8500, offset: -1000 },
  { from: 7500, offset: -500 },
];

/** 저장값이 없을 때의 기본 — 기본 구간을 행으로 펼친 것 */
export const defaultStoreOffsets = (): StoreOffsets =>
  Object.fromEntries(OFFSET_PRICES.map((p) => [String(p), DEFAULT_TIERS.find((t) => p >= t.from)?.offset ?? 0]));

/** 축에 있는 행·고를 수 있는 차액만 남긴다 — 저장 전후 정규화. 빠졌거나 이상한 행은 기본값으로 채운다 */
export const cleanStoreOffsets = (raw: unknown): StoreOffsets => {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const defaults = defaultStoreOffsets();
  return Object.fromEntries(
    OFFSET_PRICES.map((p) => {
      const v = Number(src[String(p)]);
      return [String(p), String(p) in src && OFFSET_OPTIONS.includes(v) ? v : defaults[String(p)]];
    }),
  );
};

/** 그 기준가가 따를 산식표 행 — 계단식(기준가 이하 중 가장 높은 행, 축 아래는 첫 행) */
export const offsetRowForPrice = (basePrice: number): number =>
  OFFSET_PRICES.filter((p) => basePrice >= p).at(-1) ?? OFFSET_PRICES[0];

/** 양재천 기준가에 그 지점이 적용하는 차액(원). 양재천은 늘 0, 판교는 산식표 행의 값 */
export function storePriceOffset(basePrice: number, store: StoreId, offsets: StoreOffsets = defaultStoreOffsets()): number {
  if (store !== 'pangyo') return 0;
  return offsets[String(offsetRowForPrice(basePrice))] ?? 0;
}

/** 그 지점의 판매가 — 양재천 기준가 + 산식표 차액. 미책정(null·0 이하)이면 null, 0원 밑으로는 내려가지 않는다 */
export function storePrice(basePrice: number | null | undefined, store: StoreId, offsets?: StoreOffsets): number | null {
  if (basePrice == null || basePrice <= 0) return null;
  return Math.max(0, basePrice + storePriceOffset(basePrice, store, offsets));
}

/** 파생 지점(판교) 표시 문구 — 양재천(기준 지점)이면 null. 판교는 차액이 0이어도 문구가 있다:
 *  이 값이 있으면 '양재천 책정가에서 나오는 값'이라 그 화면에서 판매가를 고치지 않는다(RecipeLedger).
 *  예: '양재천 −1,000원' · '양재천과 동일' */
export function storePriceNote(basePrice: number | null | undefined, store: StoreId, offsets?: StoreOffsets): string | null {
  if (store === 'yangjae') return null;
  if (basePrice == null || basePrice <= 0) return '양재천과 동일';
  const d = storePriceOffset(basePrice, store, offsets);
  if (!d) return '양재천과 동일';
  return `양재천 ${d < 0 ? '−' : '+'}${Math.abs(d).toLocaleString('ko-KR')}원`;
}

/** 산식표 경고 — 양재천에서 더 비싼 원두가 판교에서는 더 싸지는(가격 역전) 행의 기준가 목록 */
export const invertedRows = (offsets: StoreOffsets): number[] =>
  OFFSET_PRICES.filter((p, i) => i > 0 && p + (offsets[String(p)] ?? 0) < OFFSET_PRICES[i - 1] + (offsets[String(OFFSET_PRICES[i - 1])] ?? 0));
