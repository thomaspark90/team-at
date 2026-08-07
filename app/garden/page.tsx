'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GardenDashboard from '@/components/garden/GardenDashboard';
import GardenOps from '@/components/garden/GardenOps';
import WeatherStrip from '@/components/garden/WeatherStrip';
import WorkBoard from '@/components/garden/WorkBoard';

// 가든 대시보드 — 팀 작업 보드가 첫 화면. 들어오면 '내 차례'가 먼저 보이고,
// 그 아래 보드에서 팀 전체의 진행 단계를 본다. 세부 작업 화면(레시피 설정·캘리브레이션)은
// 카드의 버튼으로 이동하고, 기존 운영 섹션은 보드 아래에 그대로 둔다.
export default function GardenPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <WeatherStrip />
        <WorkBoard />
        <GardenDashboard section="unset" />
        <GardenOps />
      </div>
    </div>
  );
}
