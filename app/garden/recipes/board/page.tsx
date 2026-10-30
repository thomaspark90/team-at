'use client';

import RecipeBoard from '@/components/garden/RecipeBoard';

// 태블릿 레시피 보드 — 3장씩 좌우 스와이프. 전체 화면을 쓰려고 PageShell·내비 없이 띄운다.
// 권한은 경로상 '필터 레시피(recipes)' 탭에 묶인다(middleware·tabForPath 하위 경로 규칙).
export default function GardenRecipeBoardPage() {
  return <RecipeBoard />;
}
