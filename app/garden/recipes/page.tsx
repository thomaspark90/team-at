'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import BeanLedger from '@/components/garden/BeanLedger';

// 필터 원두·레시피 — 원두 장부. 발주 입력([새 원두 발주])과 레시피를 한 화면에서(2026-11-24, 구 '필터 원두 발주' 통합).
// 전체 원두 인덱스 목록(RecipeLedger 시안 C3, 2026-11-03) + 줄 누르면 발주 기록·원가 계산·카드 전체 기능.
// ?order=1 — 발주 입력 패널을 연 채로 / ?receive=<발주 id> — 홈의 수령 카드에서 넘어오면 수령 창을 바로 연다
function Inner() {
  const sp = useSearchParams();
  return <BeanLedger initialOrderOpen={sp.get('order') === '1'} receiveId={sp.get('receive')} />;
}

export default function GardenRecipesPage() {
  return (
    <PageShell nav={<GardenNav />} width="full">
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    </PageShell>
  );
}
