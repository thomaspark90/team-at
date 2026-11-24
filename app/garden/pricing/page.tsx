'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenService from '@/components/garden/GardenService';
import { fetchMyAccess } from '@/lib/access/tab-access-client';

// 필터 원두 발주 — 2026-11-24 원두 장부(/garden/filtercoffee)로 합쳤다. 이 주소로 들어오면 장부로 넘긴다:
//  · 그냥 들어오면 발주 입력 패널을 연 채로(?order=1)
//  · ?receive=<발주 id>(홈의 수령 카드)는 그대로 실어 수령 창을 바로 연다
// 장부(recipes) 권한 없이 발주 권한만 있는 계정에는 예전 입력 화면을 그대로 보여준다(넘기면 내비가 다시 돌려보낸다).
function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const receive = sp.get('receive');
  const [legacy, setLegacy] = useState(false);

  useEffect(() => {
    fetchMyAccess().then((a) => {
      if (a.mine == null || a.mine.includes('recipes')) {
        router.replace(receive ? `/garden/filtercoffee?receive=${encodeURIComponent(receive)}` : '/garden/filtercoffee?order=1');
      } else setLegacy(true);
    });
  }, [receive, router]);

  return legacy ? <GardenService receiveId={receive} /> : null;
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
