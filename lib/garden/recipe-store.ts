import type { BrewType, DripRecipe, DripRecipeSnapshot, StoreId } from '@/lib/types';

// 레시피 지점 분리(2026-10-30) — 레시피는 원두 × ICE/HOT × 지점 단위.
// store 가 없는 기존 기록은 전부 양재천 레시피로 본다(데이터 이관 없음).
export const storeOfRecipe = (r: Pick<DripRecipe, 'store'>): StoreId => r.store ?? 'yangjae';
export const brewTypeOfRecipe = (r: Pick<DripRecipe, 'brewType'>): BrewType => r.brewType ?? 'ice';

export const sameRecipeSlot = (r: DripRecipe, beanKey: string, brewType: BrewType, store: StoreId) =>
  r.beanKey === beanKey && brewTypeOfRecipe(r) === brewType && storeOfRecipe(r) === store;

// 지점 화면에 보여줄 레시피 — 그 지점 레시피가 우선, 판교에 아직 없으면 양재천 레시피를 대신 보여준다
// (fallback: true — 분쇄도는 양재천 값의 판교 환산·보정값으로 표시하고, 수정하면 판교 레시피가 새로 생긴다).
export function recipesForStore(recipes: DripRecipe[], store: StoreId): { recipe: DripRecipe; fallback: boolean }[] {
  const own = recipes.filter((r) => storeOfRecipe(r) === store);
  const out = own.map((recipe) => ({ recipe, fallback: false }));
  if (store === 'pangyo') {
    const has = new Set(own.map((r) => `${r.beanKey}:${brewTypeOfRecipe(r)}`));
    for (const r of recipes) {
      if (storeOfRecipe(r) !== 'yangjae') continue;
      if (has.has(`${r.beanKey}:${brewTypeOfRecipe(r)}`)) continue;
      out.push({ recipe: r, fallback: true });
    }
  }
  return out;
}

// 수정 이력 변경점 — 한 버전(before)에서 다음 버전(after)으로 무엇이 바뀌었는지. 예: '분쇄도 7.1→7.0 · 2차 50→55g'
type Comparable = Pick<DripRecipeSnapshot, 'doseG' | 'waterG' | 'tempC' | 'grindMesh' | 'totalTime' | 'pours'>;
export function recipeChanges(before: Comparable, after: Comparable): string[] {
  const out: string[] = [];
  const cmp = (label: string, a: unknown, b: unknown, unit = '') => {
    const fa = a == null || a === '' ? '—' : String(a);
    const fb = b == null || b === '' ? '—' : String(b);
    if (fa !== fb) out.push(`${label} ${fa}→${fb}${fb === '—' ? '' : unit}`); // 단위는 뒤에 한 번만 (50→55g)
  };
  cmp('도징', before.doseG, after.doseG, 'g');
  cmp('온도', before.tempC, after.tempC, '°C');
  cmp('분쇄도', before.grindMesh?.toFixed(1), after.grindMesh?.toFixed(1));
  cmp('시간', before.totalTime, after.totalTime);
  const pa = before.pours ?? [];
  const pb = after.pours ?? [];
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const name = pb[i]?.label ?? pa[i]?.label ?? (i === 0 ? '뜸' : `${i}차`);
    cmp(name, pa[i]?.water, pb[i]?.water, 'g');
  }
  if (pa.length === pb.length) cmp('추출량', before.waterG, after.waterG, 'g');
  return out;
}
