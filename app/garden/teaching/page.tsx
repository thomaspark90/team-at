'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GardenTeaching from '@/components/garden/teaching/GardenTeaching';

// 매니저 교육 — 스탭은 배우고 싶은 주제를 고르고, 매니저·대표는 출근 일정과 지점별 요청·교육 기록을 본다.
export default function GardenTeachingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <GardenTeaching />
      </div>
    </div>
  );
}
