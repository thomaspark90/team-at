import type { PricingSettings } from './types';

export const DEFAULT_SETTINGS: PricingSettings = {
  capacityG: 1000,
  yieldRate: 0.9,
  doseG: 20, // ICE 22g·HOT 18g의 평균 — 가격 산출용 공통 도징

  minMult: 4,
  maxMult: 5.5,
  vatIncluded: false,
};

// 시트와 동일하게 100원 단위 올림(ceil)
const round100 = (n: number) => Math.ceil(n / 100) * 100;

// 한글/유니코드 정규화 (맥 자모 분리 방지) + 비교용 소문자·공백제거
export const normalize = (s: string) =>
  s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

// 원가는 항상 부가세 포함가 기준. 공급가가 별도면 ×1.1, 포함이면 그대로 사용.
export const VAT = 1.1;

// 1g당 원가 / 잔당 재료비 (부가세 포함가 기준)
export function costPerCup(purchasePrice: number, s: PricingSettings): number {
  const actual = s.capacityG * s.yieldRate; // 실제 용량(g)
  if (actual <= 0) return 0;
  const grossPrice = s.vatIncluded ? purchasePrice : purchasePrice * VAT;
  return (grossPrice / actual) * s.doseG;
}

// 배수 → 100원 단위 판매가
export function priceAtMult(purchasePrice: number, mult: number, s: PricingSettings): number {
  return round100(costPerCup(purchasePrice, s) * mult);
}

export interface PricingResult {
  costPerCup: number;
  rangeLow: number; // 배수 minMult 가격
  rangeHigh: number; // 배수 maxMult 가격
}

export function computePricing(
  purchasePrice: number,
  s: PricingSettings = DEFAULT_SETTINGS
): PricingResult {
  return {
    costPerCup: costPerCup(purchasePrice, s),
    rangeLow: priceAtMult(purchasePrice, s.minMult, s),
    rangeHigh: priceAtMult(purchasePrice, s.maxMult, s),
  };
}
