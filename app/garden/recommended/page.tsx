'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import EducationTabs from '@/components/garden/EducationTabs';
import ChampionRecipes from '@/components/garden/ChampionRecipes';

export default function GardenRecommendedPage() {
  return (
    <PageShell nav={<GardenNav />}>
      <EducationTabs />
      <ChampionRecipes />
    </PageShell>
  );
}
