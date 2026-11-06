'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import StaffManager from '@/components/garden/schedule/StaffManager';

// 직원 명부 — 재직·이름의 정본. 스케줄·교육·발주·추출 평가가 이 명부를 읽는다(운영진 전용, API 가 강제).
export default function GardenScheduleStaffPage() {
  return (
    <PageShell
      nav={<GardenNav />}
      title="직원 명부"
      subtitle="재직을 끄면 스케줄·교육·발주·추출 평가 선택지에서 빠지고 로그인이 막힙니다. 지난 기록은 이름(퇴사)로 남습니다."
      actions={<Link href="/garden/schedule" className="text-body text-muted-foreground">‹ 스케줄로</Link>}
    >
      <StaffManager />
    </PageShell>
  );
}
