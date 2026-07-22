'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import WikiReviewQueue from '@/components/garden/WikiReviewQueue';

export default function GardenWikiReviewPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[15px] font-medium">커피 위키 — 승인 큐</h1>
          <a href="/garden/wiki" className="text-[13px] underline text-muted-foreground hover:text-foreground">위키로 돌아가기 →</a>
        </div>
        <WikiReviewQueue />
      </div>
    </div>
  );
}
