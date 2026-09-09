'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenService from '@/components/garden/GardenService';

export default function GardenPricingPage() {
  return (
    <PageShell nav={<GardenNav />} width="wide">
      <GardenService />
    </PageShell>
  );
}
