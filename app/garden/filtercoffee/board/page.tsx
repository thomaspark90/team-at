'use client';

import RecipeBoard from '@/components/garden/RecipeBoard';

// 태블릿 레시피 보드 — 원두 이름 목록 → 이름 누르고 들어가 추출 → 추출 평가. 전체 화면을 쓰려고 PageShell·내비 없이 띄운다.
// 권한은 경로상 '필터커피(recipes)' 탭에 묶인다(middleware·tabForPath 하위 경로 규칙).
export default function GardenRecipeBoardPage() {
  return <RecipeBoard />;
}
