'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenService from '@/components/garden/GardenService';

// ?receive=<발주 id> — 작업 보드의 수령 카드에서 넘어오면 수령 창을 바로 연다
function Inner() {
  const sp = useSearchParams();
  return <GardenService receiveId={sp.get('receive')} />;
}

export default function GardenPricingPage() {
  return (
    <PageShell nav={<GardenNav />} width="wide">
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    </PageShell>
  );
}
