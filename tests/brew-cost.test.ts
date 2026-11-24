import { describe, expect, it } from 'vitest';
import type { DripRecipe, PurchaseRecord } from '@/lib/types';
import { currentCost, currentDoseG, currentRange } from '@/lib/garden/brew-cost';
import { cleanStoreOffsets, defaultStoreOffsets, invertedRows, storePrice, storePriceNote } from '@/lib/garden/store-price';

// 발주 기록 재료비는 발주 당시 스냅샷이 아니라 지금 레시피 도징을 따라간다 (2026-11-13)
const rec = {
  id: 'r1',
  createdAt: '2026-11-13T00:00:00.000Z',
  bean: '테스트 게이샤',
  purchasePrice: 220000,
  settings: { capacityG: 1000, yieldRate: 0.9, doseG: 20, minMult: 2, maxMult: 2.75, vatIncluded: true },
  costPerCup: 4888.89,
  rangeLow: 10000,
  rangeHigh: 13500,
} as unknown as PurchaseRecord;

const recipe = (brewType: 'ice' | 'hot', doseG: number) =>
  ({ beanKey: '테스트 게이샤', bean: '테스트 게이샤', brewType, doseG, store: 'yangjae' }) as unknown as DripRecipe;

describe('지금 레시피 기준 재료비', () => {
  it('레시피가 없으면 기준값 ICE 20g·HOT 18g 의 중간 19g', () => {
    expect(currentDoseG([], rec.bean)).toBe(19);
    expect(Math.round(currentCost([], rec))).toBe(4644); // 220,000 ÷ 900 × 19
  });

  it('ICE 레시피가 20g → 22g 으로 바뀌면 재료비가 따라 오른다', () => {
    expect(Math.round(currentCost([recipe('ice', 20)], rec))).toBe(4644);
    expect(currentDoseG([recipe('ice', 22)], rec.bean)).toBe(20); // (22 + 18) ÷ 2
    expect(Math.round(currentCost([recipe('ice', 22)], rec))).toBe(4889); // 220,000 ÷ 900 × 20
  });

  it('권장 판매 범위도 지금 재료비 기준 — 배수는 발주 당시 그대로', () => {
    expect(currentRange([], rec)).toEqual({ low: 9500, high: 13000 }); // 4,644 × 2 · × 2.75 → 500원 올림
  });
});

// 지점별 판매가·재료비 (2026-11-19) — 판교는 양재천 판매가 −1,000원, 재료비는 그 지점 레시피 도징 기준
describe('지점별 판매가·재료비', () => {
  const at = (store: 'yangjae' | 'pangyo', brewType: 'ice' | 'hot', doseG: number) =>
    ({ ...recipe(brewType, doseG), store }) as unknown as DripRecipe;

  it('판교 판매가 기본 구간 — 8,500원 이상 −1,000 · 7,500원 이상 −500 · 그 아래 동일, 미책정은 그대로 미책정', () => {
    expect(storePrice(9000, 'yangjae')).toBe(9000);
    expect(storePrice(9000, 'pangyo')).toBe(8000);
    expect(storePrice(8500, 'pangyo')).toBe(7500);
    expect(storePrice(8000, 'pangyo')).toBe(7500);
    expect(storePrice(7500, 'pangyo')).toBe(7000);
    expect(storePrice(7000, 'pangyo')).toBe(7000);
    expect(storePrice(6500, 'pangyo')).toBe(6500);
    expect(storePrice(20000, 'pangyo')).toBe(19000); // 축(15,000원) 위는 맨 아래 행
    expect(storePrice(4000, 'pangyo')).toBe(4000); // 축(5,000원) 아래는 맨 위 행
    expect(storePrice(null, 'pangyo')).toBeNull();
    for (let p = 7000; p <= 20000; p += 500) expect(storePrice(p, 'pangyo')).toBeGreaterThanOrEqual(7000);
  });

  it('판교 문구는 차액이 0이어도 있다 — 판교 화면에서 판매가를 고치지 않게 하는 표시', () => {
    expect(storePriceNote(8500, 'pangyo')).toBe('양재천 −1,000원');
    expect(storePriceNote(7500, 'pangyo')).toBe('양재천 −500원');
    expect(storePriceNote(7000, 'pangyo')).toBe('양재천과 동일');
    expect(storePriceNote(null, 'pangyo')).toBe('양재천과 동일');
    expect(storePriceNote(9000, 'yangjae')).toBeNull();
  });

  it('산식표 저장값을 따르고, 이상한 값은 기본으로 되돌리며, 가격 역전을 찾아낸다', () => {
    const t = cleanStoreOffsets({ ...defaultStoreOffsets(), '8000': -1500, '9000': -300, '99999': -500 });
    expect(storePrice(8000, 'pangyo', t)).toBe(6500);
    expect(storePrice(8000, 'yangjae', t)).toBe(8000);
    expect(t['9000']).toBe(-1000); // 고를 수 없는 차액 → 기본
    expect('99999' in t).toBe(false);
    expect(invertedRows(t)).toEqual([8000]); // 7,500 → 7,000 인데 8,000 → 6,500
    expect(invertedRows(defaultStoreOffsets())).toEqual([]);
  });

  it('판교 레시피가 있으면 판교 도징으로, 없으면 양재천 도징으로 재료비를 낸다', () => {
    const rs = [at('yangjae', 'ice', 22), at('yangjae', 'hot', 18), at('pangyo', 'ice', 18)];
    expect(currentDoseG(rs, rec.bean, 'yangjae')).toBe(20); // (22 + 18) ÷ 2
    expect(currentDoseG(rs, rec.bean, 'pangyo')).toBe(18); // 판교 ICE 18 + (판교 HOT 없음 → 양재천 18) ÷ 2
    expect(Math.round(currentCost(rs, rec, 'pangyo'))).toBe(4400); // 220,000 ÷ 900 × 18
    expect(currentDoseG(rs, rec.bean)).toBe(20); // 지점 생략 = 양재천
  });
});
