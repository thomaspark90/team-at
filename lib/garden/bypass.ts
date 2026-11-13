import type { DripRecipe } from '@/lib/types';

// 가수(bypass) — 추출이 끝난 뒤 서버에 더하는 물 (2026-11-13 대표 결정, 시안 A: 가수량을 g 으로 직접 지정).
// 푸어링(추출량)과 따로 둔다 — 추출비·차수별 물량에는 넣지 않고, 음료량 = 추출량 + 가수 로만 더한다.
// ICE·HOT 둘 다 쓸 수 있고, 기본은 없음(기존 레시피는 필드가 없어 0g).
export const BYPASS_STEP_G = 5;
export const BYPASS_MAX_G = 60;
export const BYPASS_OPTS = Array.from({ length: BYPASS_MAX_G / BYPASS_STEP_G + 1 }, (_, i) => i * BYPASS_STEP_G); // 0~60g

/** 레시피의 가수량(g) — 없으면 0 */
export const bypassOf = (r: Pick<DripRecipe, 'bypassG'> | null | undefined): number => (r?.bypassG && r.bypassG > 0 ? r.bypassG : 0);

/** 표기 — 0 이면 '없음', 아니면 '+30g' */
export const bypassText = (g: number) => (g > 0 ? `+${g}g` : '없음');

/** 음료량(g) = 추출량 + 가수. 추출량이 없으면 null */
export const drinkG = (r: Pick<DripRecipe, 'waterG' | 'bypassG'>): number | null => (r.waterG != null ? r.waterG + bypassOf(r) : null);

/** 저장 전 정리(서버) — 0·빈값·이상값은 null(가수 없음). 범위 밖 값은 받지 않는다 */
export function cleanBypass(v: unknown): number | null {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n) || n <= 0 || n > 200) return null;
  return Math.round(n);
}
