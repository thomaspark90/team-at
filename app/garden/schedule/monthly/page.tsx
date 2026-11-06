'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import MonthlyReport from '@/components/garden/schedule/MonthlyReport';

// 월 근무시간 집계(운영진 전용, API 가 강제) — 급여 담당이 시트에 다시 옮기지 않도록.
export default function GardenScheduleMonthlyPage() {
  return (
    <PageShell nav={<GardenNav />} title="월 근무시간 집계" actions={<Link href="/garden/schedule" className="text-body text-muted-foreground">‹ 스케줄로</Link>}>
      <MonthlyReport />
    </PageShell>
  );
}
