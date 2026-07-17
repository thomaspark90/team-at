'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GardenSettings from '@/components/garden/GardenSettings';

// 가든 설정 — 분쇄도 측정 요청 발송, 필터커피 투두리스트, 알림 수신자·채널 관리
export default function GardenSettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <GardenSettings />
      </div>
    </div>
  );
}
