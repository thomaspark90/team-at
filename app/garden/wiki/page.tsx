'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import WikiBrowser from '@/components/garden/WikiBrowser';

export default function GardenWikiPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <h1 className="mb-4 text-[15px] font-medium">커피 위키</h1>
        <WikiBrowser />
      </div>
    </div>
  );
}
