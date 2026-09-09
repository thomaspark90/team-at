'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenWords from '@/components/garden/GardenWords';

// 제철 단어 검수 — 손님 기고 단어 게시/반려
export default function GardenWordsPage() {
  return (
    <PageShell nav={<GardenNav />}>
      <GardenWords />
    </PageShell>
  );
}
