'use client';

import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import WorkBoard from '@/components/garden/WorkBoard';

// 스탭밀 대시보드 — 스탭밀 일만 보이는 작업 보드(메뉴 스토리·스탭밀 송금).
// 가든 일은 /garden 보드에 따로 뜬다.
export default function StudioHomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <WorkBoard scope="staffmeal" />
      </div>
    </div>
  );
}
