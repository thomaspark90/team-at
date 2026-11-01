import type { BrewType } from '@/lib/types';

// ICE/HOT 구분색 — ICE 옅은 하늘색, HOT 옅은 갈색(2026-11-01 대표 지시: 버튼만 보고 바로 알아보게).
// 디자인 시스템의 '장식 색 금지' 예외 — 상태 신호처럼 ICE/HOT 선택에만 쓴다. 다크 모드에서도 읽히게 글자색은 진하게.
export const BREW_TINT: Record<BrewType, { bg: string; fg: string }> = {
  ice: { bg: 'hsl(200 75% 90%)', fg: 'hsl(205 65% 30%)' },
  hot: { bg: 'hsl(28 50% 86%)', fg: 'hsl(24 50% 28%)' },
};

// 선택된 세그먼트 칩 스타일 — ta-seg-on 의 흰 칩 위에 색을 덮는다
export const brewOnStyle = (bt: BrewType) => ({ background: BREW_TINT[bt].bg, color: BREW_TINT[bt].fg });
