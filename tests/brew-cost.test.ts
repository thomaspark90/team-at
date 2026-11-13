import { describe, expect, it } from 'vitest';
import type { DripRecipe, PurchaseRecord } from '@/lib/types';
import { currentCost, currentDoseG, currentRange } from '@/lib/garden/brew-cost';

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
