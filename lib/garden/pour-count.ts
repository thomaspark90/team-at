import type { PourStep } from '@/lib/types';

// 푸어링 횟수 옵션(뜸 제외) — 레시피 설정 창에서 2번/3번을 고른다 (2026-11-11 대표 지시).
// 횟수를 바꿔도 뜸과 총 물량은 그대로 두고, 뜸 뒤 물량만 5g 단위로 고르게 다시 나눈다(남는 5g은 앞 차수부터).
// 총 추출량 먼저(2026-11-11 대표 제안): 총량을 고르면 뜸을 뺀 나머지를 횟수대로 나누고, 차수를 지우거나 더해도 총량은 유지.
// 차수 하나의 물량을 직접 바꾸면 총량이 따라 바뀐다(다른 차수는 건드리지 않음).
export const POUR_COUNT_OPTS = [2, 3] as const;
export const TOTAL_WATER_OPTS = Array.from({ length: 31 }, (_, i) => 150 + i * 5); // 총 추출량 150~300g (5g)
const DEFAULT_COUNT = 3; // 뜸만 있거나 구 기록일 때 나눌 횟수

const BLOOM_G = 35; // 뜸이 없는 구 기록을 나눌 때 쓰는 매장 기준 뜸 물량
const STEP_G = 5;
const FALLBACK_POUR_G = 40; // 나눌 물량이 없을 때 차수당 기본값

const hasBloom = (pours: PourStep[]) => pours.length > 0 && (pours[0].label ?? '뜸') === '뜸';

// 현재 푸어링 횟수(뜸 제외). 뜸으로 시작하지 않는 구 기록('총 물량' 한 단계 등)은 null
export const pourCountOf = (pours: PourStep[]): number | null => (hasBloom(pours) ? pours.length - 1 : null);

// 뜸 + (rest 를 n번으로 5g 단위 균등 분할) — 남는 5g 은 앞 차수부터, 5g 로 안 떨어지는 자투리는 1차에
function split(bloom: PourStep, rest: number, n: number): PourStep[] {
  if (rest <= 0) {
    return [bloom, ...Array.from({ length: n }, (_, i) => ({ water: FALLBACK_POUR_G, label: `${i + 1}차` }))];
  }
  const base = Math.floor(rest / n / STEP_G) * STEP_G;
  let left = rest - base * n;
  const waters = Array.from({ length: n }, () => base);
  for (let i = 0; i < n && left >= STEP_G; i++, left -= STEP_G) waters[i] += STEP_G;
  waters[0] += left;
  return [bloom, ...waters.map((water, i) => ({ water, label: `${i + 1}차` }))];
}

const bloomOf = (pours: PourStep[]): PourStep => (hasBloom(pours) ? pours[0] : { water: BLOOM_G, label: '뜸' });
const totalOf = (pours: PourStep[]) => pours.reduce((a, s) => a + s.water, 0);

// 푸어링 횟수 전환 — 뜸·총 물량 유지, 뜸 뒤 물량을 n번으로 다시 나눈다
export function withPourCount(pours: PourStep[], n: number): PourStep[] {
  const bloom = bloomOf(pours);
  return split(bloom, totalOf(pours) - bloom.water, n);
}

// 총 추출량 선택 — 뜸·횟수 유지, (총량 − 뜸)을 다시 나눈다
export function withTotalWater(pours: PourStep[], total: number): PourStep[] {
  const bloom = bloomOf(pours);
  return split(bloom, total - bloom.water, pourCountOf(pours) || DEFAULT_COUNT);
}

// 차수 추가(+1)·삭제(−1) — 총량 유지하고 다시 나눈다. 뜸으로 시작하지 않거나 차수가 0이 되면 null(호출부가 기존 방식으로 처리)
export function withPourDelta(pours: PourStep[], delta: 1 | -1): PourStep[] | null {
  const n = pourCountOf(pours);
  if (n == null || n + delta < 1) return null;
  return withPourCount(pours, n + delta);
}
