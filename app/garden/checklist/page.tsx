'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import ChecklistBoard from '@/components/garden/checklist/ChecklistBoard';

// 오픈·마감 체크리스트 — 근무표로 그날의 담당을 정해 자기 휴대폰에서 체크한다. 운영진은 전체 현황과 항목을 관리한다.
export default function GardenChecklistPage() {
  return (
    <PageShell nav={<GardenNav />} title="체크리스트">
      <ChecklistBoard />
    </PageShell>
  );
}
