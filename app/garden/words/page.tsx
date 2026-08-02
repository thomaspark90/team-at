'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GardenWords from '@/components/garden/GardenWords';

// 제철 단어 검수 — 손님 기고 단어 게시/반려
export default function GardenWordsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <GardenWords />
      </div>
    </div>
  );
}
