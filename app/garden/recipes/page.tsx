'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenDashboard from '@/components/garden/GardenDashboard';

// 필터 레시피 — 레시피 홈. 전체 원두 인덱스 목록(RecipeLedger 시안 C3, 2026-11-03) + 줄 누르면 원가 계산·카드 전체 기능.
export default function GardenRecipesPage() {
  return (
    <PageShell nav={<GardenNav />}>
      <GardenDashboard section="recipes" />
    </PageShell>
  );
}
