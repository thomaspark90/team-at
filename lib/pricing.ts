import type { CompetitorRow, PricingSettings } from './types';

export const DEFAULT_SETTINGS: PricingSettings = {
  capacityG: 1000,
  yieldRate: 0.9,
  doseG: 19,
  minMult: 4,
  maxMult: 5.5,
  vatIncluded: false,
};

// 시트와 동일하게 100원 단위 올림(ceil)
const round100 = (n: number) => Math.ceil(n / 100) * 100;

// 한글/유니코드 정규화 (맥 자모 분리 방지) + 비교용 소문자·공백제거
export const normalize = (s: string) =>
  s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

const tokenize = (s: string) => normalize(s).split(' ').filter(Boolean);

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
  marketLow: number | null;
  marketHigh: number | null;
  recLow: number; // 권장 하단 (원가+시장 결합)
  recHigh: number; // 권장 상단
  diagnosis: 'under' | 'over' | 'fit' | 'no-market';
}

export function computePricing(
  purchasePrice: number,
  matches: CompetitorRow[],
  s: PricingSettings = DEFAULT_SETTINGS
): PricingResult {
  const rangeLow = priceAtMult(purchasePrice, s.minMult, s);
  const rangeHigh = priceAtMult(purchasePrice, s.maxMult, s);

  const prices = matches.map((m) => m.price).filter((p) => p > 0);
  const marketLow = prices.length ? Math.min(...prices) : null;
  const marketHigh = prices.length ? Math.max(...prices) : null;

  let recLow = rangeLow;
  let recHigh = rangeHigh;
  let diagnosis: PricingResult['diagnosis'] = 'no-market';

  if (marketLow !== null && marketHigh !== null) {
    recLow = Math.max(rangeLow, marketLow);
    recHigh = Math.max(recLow, Math.min(rangeHigh, marketHigh));
    if (rangeHigh < marketLow) diagnosis = 'under'; // 원가 band가 시장보다 낮음 → 인상 여유
    else if (rangeLow > marketHigh) diagnosis = 'over'; // 원가가 시장보다 높음 → 주의
    else diagnosis = 'fit';
  }

  return {
    costPerCup: costPerCup(purchasePrice, s),
    rangeLow,
    rangeHigh,
    marketLow,
    marketHigh,
    recLow,
    recHigh,
    diagnosis,
  };
}

// 원두명 키워드 부분일치. 겹치는 토큰 수가 많을수록 위로 정렬.
export function matchBeans(query: string, rows: CompetitorRow[]): CompetitorRow[] {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  return rows
    .map((row) => {
      const beanNorm = normalize(row.bean);
      const score = qTokens.reduce((acc, t) => (beanNorm.includes(t) ? acc + 1 : acc), 0);
      return { row, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row);
}
