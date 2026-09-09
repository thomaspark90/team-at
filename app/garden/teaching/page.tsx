'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenTeaching from '@/components/garden/teaching/GardenTeaching';

// 매니저 교육 — 스탭은 배우고 싶은 주제를 고르고, 매니저·대표는 출근 일정과 지점별 요청·교육 기록을 본다.
// 제목 줄(교육 · 알림 · + 일정)은 ShiftCalendar 가 역할별로 그리므로 PageShell 엔 title 을 주지 않는다.
export default function GardenTeachingPage() {
  return (
    <PageShell nav={<GardenNav />}>
      <GardenTeaching />
    </PageShell>
  );
}
