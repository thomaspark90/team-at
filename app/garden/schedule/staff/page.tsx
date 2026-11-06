'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import StaffManager from '@/components/garden/schedule/StaffManager';

// 근무자 명부 — 재직 여부·기본 지점·입사일 관리(운영진 전용, API 가 강제).
export default function GardenScheduleStaffPage() {
  return (
    <PageShell
      nav={<GardenNav />}
      title="근무자 명부"
      subtitle="재직을 끄면 새 스케줄과 지난주 복사에서 빠집니다. 지난 근무 기록은 그대로 남습니다."
      actions={<Link href="/garden/schedule" className="text-body text-muted-foreground">‹ 스케줄로</Link>}
    >
      <StaffManager />
    </PageShell>
  );
}
