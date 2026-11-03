import type { BrewType, DripRecipe, PurchaseRecord } from '@/lib/types';
import { costPerCup, DEFAULT_SETTINGS } from '@/lib/pricing';
import { presetById } from '@/lib/drip-presets';

// ICE·HOT 별 잔당 재료비 — 판매가 설정 화면의 원가율을 ICE/HOT 따로 보여주기 위해(2026-11-03 대표 결정).
// 도징량은 그 원두의 양재천 레시피(없으면 판교)에서, 레시피가 없으면 매장 기준 프리셋(ICE 22g · HOT 18g).
// 판매가는 VAT 포함 소비자가 그대로 — 원가율 = 재료비 ÷ 판매가 (기존 화면과 같은 기준).

export type BrewDoses = Record<BrewType, { doseG: number; fromRecipe: boolean }>;

export const PRESET_DOSE: Record<BrewType, number> = {
  ice: presetById('house-ice')?.defaultDoseG ?? 22,
  hot: presetById('house-hot')?.defaultDoseG ?? 18,
};

export function dosesForBean(recipes: DripRecipe[], beanKey: string): BrewDoses {
  const pick = (bt: BrewType) => {
    const mine = recipes.filter((r) => r.beanKey === beanKey && (r.brewType ?? 'ice') === bt && r.doseG != null);
    const r = mine.find((x) => (x.store ?? 'yangjae') === 'yangjae') ?? mine[0];
    return r ? { doseG: r.doseG as number, fromRecipe: true } : { doseG: PRESET_DOSE[bt], fromRecipe: false };
  };
  return { ice: pick('ice'), hot: pick('hot') };
}

// 판매가 판단 기준 도징 — ICE·HOT 도징량의 중간값(2026-11-03 대표 결정). 레시피 없는 쪽은 프리셋(22g·18g)
export const baseDoseG = (iceG: number | null | undefined, hotG: number | null | undefined): number =>
  ((iceG ?? PRESET_DOSE.ice) + (hotG ?? PRESET_DOSE.hot)) / 2;

export function brewCost(rec: PurchaseRecord, doseG: number): number {
  return costPerCup(rec.purchasePrice, { ...DEFAULT_SETTINGS, ...rec.settings, doseG });
}
