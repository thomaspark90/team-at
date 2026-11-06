'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import ScheduleBoard from '@/components/garden/schedule/ScheduleBoard';

// 근무 스케줄 — 운영진이 주간 계획을 작성·배포하고 실제 근무를 고친다. 직원은 배포된 계획을 본다.
export default function GardenSchedulePage() {
  return (
    <PageShell nav={<GardenNav />} title="근무 스케줄">
      <ScheduleBoard />
    </PageShell>
  );
}
