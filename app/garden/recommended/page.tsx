'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import ChampionRecipes from '@/components/garden/ChampionRecipes';

export default function GardenRecommendedPage() {
  return (
    <PageShell nav={<GardenNav />}>
      <ChampionRecipes />
    </PageShell>
  );
}
