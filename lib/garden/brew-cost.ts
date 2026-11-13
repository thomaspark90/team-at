import type { BrewType, DripRecipe, PurchaseRecord } from '@/lib/types';
import { costPerCup, DEFAULT_SETTINGS, normalize, priceAtMult } from '@/lib/pricing';

// ICE·HOT 별 잔당 재료비 — 판매가 설정 화면의 원가율을 ICE/HOT 따로 보여주기 위해(2026-11-03 대표 결정).
// 도징량은 그 원두의 양재천 레시피(없으면 판교)에서, 레시피가 없으면 판매가 산식 기준값(ICE 20g · HOT 18g).
// 판매가는 VAT 포함 소비자가 그대로 — 원가율 = 재료비 ÷ 판매가 (기존 화면과 같은 기준).

export type BrewDoses = Record<BrewType, { doseG: number; fromRecipe: boolean }>;

// 판매가 산식 전용 기준 도징 — ICE 20g · HOT 18g · 평균 19g (2026-11-13 대표 결정, 이전 22g·18g·20g).
// 추출 레시피 프리셋(lib/drip-presets.ts 의 defaultDoseG, 현재 같은 20g·18g)과는 따로 둔다 — 한쪽을 바꿔도 다른 쪽은 그대로.
export const PRESET_DOSE: Record<BrewType, number> = { ice: 20, hot: 18 };

export function dosesForBean(recipes: DripRecipe[], beanKey: string): BrewDoses {
  const pick = (bt: BrewType) => {
    const mine = recipes.filter((r) => r.beanKey === beanKey && (r.brewType ?? 'ice') === bt && r.doseG != null);
    const r = mine.find((x) => (x.store ?? 'yangjae') === 'yangjae') ?? mine[0];
    return r ? { doseG: r.doseG as number, fromRecipe: true } : { doseG: PRESET_DOSE[bt], fromRecipe: false };
  };
  return { ice: pick('ice'), hot: pick('hot') };
}

// 판매가 판단 기준 도징 — ICE·HOT 도징량의 중간값(2026-11-03 대표 결정). 레시피 없는 쪽은 기준값(20g·18g → 평균 19g)
export const baseDoseG = (iceG: number | null | undefined, hotG: number | null | undefined): number =>
  ((iceG ?? PRESET_DOSE.ice) + (hotG ?? PRESET_DOSE.hot)) / 2;

export function brewCost(rec: PurchaseRecord, doseG: number): number {
  return costPerCup(rec.purchasePrice, { ...DEFAULT_SETTINGS, ...rec.settings, doseG });
}

// ---- 지금 레시피 기준 재료비 (2026-11-13 대표 지시) ----
// 발주 기록에 저장된 costPerCup 은 발주 당시 도징 스냅샷이다. 발주 뒤 레시피 도징이 바뀌면(예: ICE 20g → 22g)
// 재료비도 따라가야 하므로, 화면은 저장값 대신 이 함수로 지금 레시피 도징(ICE·HOT 중간값)에 맞춰 다시 계산한다.

/** 그 원두의 지금 기준 도징(g) — 레시피 ICE·HOT 중간값, 레시피 없는 쪽은 기준값 */
export function currentDoseG(recipes: DripRecipe[], bean: string): number {
  const d = dosesForBean(recipes, normalize(bean));
  return baseDoseG(d.ice.doseG, d.hot.doseG);
}

/** 발주 기록의 지금 기준 잔당 재료비 */
export const currentCost = (recipes: DripRecipe[], rec: PurchaseRecord): number =>
  brewCost(rec, currentDoseG(recipes, rec.bean));

/** 발주 기록의 지금 기준 권장 판매 범위 — 배수는 발주 당시 스냅샷(settings.minMult·maxMult) 그대로 */
export function currentRange(recipes: DripRecipe[], rec: PurchaseRecord): { low: number; high: number } {
  const s = { ...DEFAULT_SETTINGS, ...rec.settings, doseG: currentDoseG(recipes, rec.bean) };
  return { low: priceAtMult(rec.purchasePrice, s.minMult, s), high: priceAtMult(rec.purchasePrice, s.maxMult, s) };
}
