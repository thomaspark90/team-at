import type { BrewType, DripRecipe, PourStep, StoreId } from '@/lib/types';
import { brewTypeOfRecipe, storeOfRecipe } from '@/lib/garden/recipe-store';

// 새 레시피 기본값 — 같은 지점·같은 ICE/HOT 최근 레시피 20개에서 '가장 많이 쓴 값'(2026-11-01 대표 결정).
// 동률이면 더 최근에 쓴 값. 레시피가 하나도 없으면 null(호출부가 매장 기준 프리셋을 쓴다).
export const RECENT_N = 20;

export interface RecentDefaults {
  doseG: number | null;
  tempC: number | null;
  grindMesh: number | null;
  totalTime: string | null;
  pours: PourStep[] | null;
  count: number; // 근거가 된 레시피 수
}

// 최근순 배열에서 최빈값 — 동률이면 먼저(=더 최근) 나온 값
function mode<T>(values: (T | null | undefined)[]): T | null {
  const counts = new Map<T, { n: number; first: number }>();
  values.forEach((v, i) => {
    if (v == null || v === '') return;
    const c = counts.get(v);
    if (c) c.n += 1;
    else counts.set(v, { n: 1, first: i });
  });
  let best: T | null = null;
  let bestN = 0;
  let bestFirst = Infinity;
  for (const [v, c] of Array.from(counts.entries())) {
    if (c.n > bestN || (c.n === bestN && c.first < bestFirst)) {
      best = v;
      bestN = c.n;
      bestFirst = c.first;
    }
  }
  return best;
}

export function recentDefaults(
  recipes: DripRecipe[],
  brewType: BrewType,
  store: StoreId,
  n = RECENT_N
): RecentDefaults | null {
  const recent = recipes
    .filter((r) => brewTypeOfRecipe(r) === brewType && storeOfRecipe(r) === store)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, n);
  if (recent.length === 0) return null;

  // 푸어링 — 가장 흔한 횟수를 고르고, 그 횟수 레시피들에서 단계별 가장 흔한 g
  let pours: PourStep[] | null = null;
  const len = mode(recent.map((r) => (r.pours?.length ? r.pours.length : null)));
  if (len != null) {
    const same = recent.filter((r) => r.pours?.length === len);
    pours = Array.from({ length: len }, (_, i) => ({
      water: mode(same.map((r) => r.pours![i].water)) ?? 0,
      label: i === 0 ? '뜸' : `${i}차`,
    }));
  }
  return {
    doseG: mode(recent.map((r) => r.doseG)),
    tempC: mode(recent.map((r) => r.tempC)),
    grindMesh: mode(recent.map((r) => r.grindMesh ?? null)),
    totalTime: mode(recent.map((r) => r.totalTime || null)),
    pours,
    count: recent.length,
  };
}
