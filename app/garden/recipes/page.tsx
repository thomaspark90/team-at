'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenDashboard from '@/components/garden/GardenDashboard';

// 필터 레시피 — 레시피 홈. 국가별 그룹 + 카드 전체 기능(수정·타이머·이력·재고칩).
export default function GardenRecipesPage() {
  return (
    <PageShell nav={<GardenNav />}>
      <GardenDashboard section="recipes" />
    </PageShell>
  );
}
