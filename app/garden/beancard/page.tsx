'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import BeanCardPrint from '@/components/garden/BeanCardPrint';

// 원두카드 인쇄 — 발주 기록 데이터로 A4 3×3 카드를 만들어 브라우저에서 바로 출력
function Inner() {
  const sp = useSearchParams();
  return <BeanCardPrint recordId={sp.get('recordId')} />;
}

export default function GardenBeanCardPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="print:hidden">
        <TabNav />
        <GardenNav />
      </div>
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    </div>
  );
}
