'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GardenDashboard from '@/components/garden/GardenDashboard';

// 필터 레시피 — 레시피 홈. 국가별 그룹 + 카드 전체 기능(수정·타이머·이력·재고칩).
export default function GardenRecipesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <GardenDashboard section="recipes" />
      </div>
    </div>
  );
}
