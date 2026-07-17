'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GardenDashboard from '@/components/garden/GardenDashboard';
import GardenOps from '@/components/garden/GardenOps';

// 가든 대시보드 — 운영 보드. 레시피 카드는 필터 레시피 탭(/garden/recipes)으로 이동,
// 여기엔 레시피 미설정 원두(설정 시작점)와 캘리브레이션·드리프트 체크만 남는다.
export default function GardenPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <GardenDashboard section="unset" />
        <GardenOps />
      </div>
    </div>
  );
}
