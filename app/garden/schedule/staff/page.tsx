'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import StaffManager from '@/components/garden/schedule/StaffManager';

// 직원 명부 — 재직·이름의 정본. 스케줄·교육·발주·추출 평가가 이 명부를 읽는다(운영진 전용, API 가 강제).
// 2026-11-26 통합: 업무 지정 · 권한 묶음과 계정 도구도 이 화면에 있다(권한 · 계정 도구는 관리자에게만 보인다). /settings 는 여기로 넘어온다.
export default function GardenScheduleStaffPage() {
  return (
    <PageShell
      nav={<GardenNav />}
      title="직원 명부"
      subtitle="사람에 관한 설정을 한 화면에서 봅니다. 묶음을 고르면 그 열만 보입니다. 재직을 끄면 스케줄·교육·발주·추출 평가 선택지에서 빠지고 로그인이 막힙니다. 지난 기록은 이름(퇴사)로 남습니다."
      actions={<Link href="/garden/schedule" className="text-body text-muted-foreground">‹ 스케줄로</Link>}
    >
      <StaffManager />
    </PageShell>
  );
}
