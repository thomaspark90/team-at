import type { PourStep } from '@/lib/types';

// 푸어링 횟수 옵션(뜸 제외) — 레시피 설정 창에서 2번/3번을 고른다 (2026-11-11 대표 지시).
// 횟수를 바꿔도 뜸과 총 물량은 그대로 두고, 뜸 뒤 물량만 5g 단위로 고르게 다시 나눈다(남는 5g은 앞 차수부터).
export const POUR_COUNT_OPTS = [2, 3] as const;

const BLOOM_G = 35; // 뜸이 없는 구 기록을 나눌 때 쓰는 매장 기준 뜸 물량
const STEP_G = 5;
const FALLBACK_POUR_G = 40; // 나눌 물량이 없을 때 차수당 기본값

const hasBloom = (pours: PourStep[]) => pours.length > 0 && (pours[0].label ?? '뜸') === '뜸';

// 현재 푸어링 횟수(뜸 제외). 뜸으로 시작하지 않는 구 기록('총 물량' 한 단계 등)은 null
export const pourCountOf = (pours: PourStep[]): number | null => (hasBloom(pours) ? pours.length - 1 : null);

// 뜸 뒤 물량을 n번으로 다시 나눈 푸어링 — 총 물량 유지
export function withPourCount(pours: PourStep[], n: number): PourStep[] {
  const total = pours.reduce((a, s) => a + s.water, 0);
  const bloom: PourStep = hasBloom(pours) ? pours[0] : { water: BLOOM_G, label: '뜸' };
  const rest = total - bloom.water;
  if (rest <= 0) {
    return [bloom, ...Array.from({ length: n }, (_, i) => ({ water: FALLBACK_POUR_G, label: `${i + 1}차` }))];
  }
  const base = Math.floor(rest / n / STEP_G) * STEP_G;
  let left = rest - base * n;
  const waters = Array.from({ length: n }, () => base);
  for (let i = 0; i < n && left >= STEP_G; i++, left -= STEP_G) waters[i] += STEP_G;
  waters[0] += left; // 5g 로 안 떨어지는 자투리는 1차에
  return [bloom, ...waters.map((water, i) => ({ water, label: `${i + 1}차` }))];
}
