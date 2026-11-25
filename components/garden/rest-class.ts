import type { RestStage } from '@/lib/garden/roast';

// 로스팅 후 경과일(D+ · +NN) 숙성 단계 색 — 디자인 시스템 상태색(emerald · amber · destructive).
// 단계 규칙(7일 미만 숙성 중 · 7~21일 적기 · 22~30일 지남 · 31일~ 오래됨)은 lib/garden/roast.ts 의 restStage.
// 클래스 이름은 반드시 components 아래에 둔다 — Tailwind 가 app · components 만 훑어서(tailwind.config.ts content)
// lib 에만 적은 클래스는 CSS 가 만들어지지 않는다(2026-11-26: lib 에 있던 탓에 주황 글자 · 초록 바탕이 빠져 있었다).

// 알약(옅은 바탕 + 글자색) — 필터커피 장부 · 원두 카드의 D+
export const restClass: Record<RestStage, string> = {
  resting: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  peak: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  late: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  old: 'bg-destructive/10 text-destructive',
};

// 글자색만 — 레시피 보드의 「+NN」
export const restTextClass: Record<RestStage, string> = {
  resting: 'text-amber-700 dark:text-amber-400',
  peak: 'text-emerald-700 dark:text-emerald-400',
  late: 'text-amber-700 dark:text-amber-400',
  old: 'text-destructive',
};
