'use client';

import TabNav from '@/components/TabNav';
import GardenService from '@/components/garden/GardenService';

export default function GardenPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <GardenService />
      </div>
    </div>
  );
}
