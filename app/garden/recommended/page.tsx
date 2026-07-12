'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import ChampionRecipes from '@/components/garden/ChampionRecipes';

export default function GardenRecommendedPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <ChampionRecipes />
      </div>
    </div>
  );
}
