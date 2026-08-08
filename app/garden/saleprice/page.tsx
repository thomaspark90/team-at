'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GardenSalePrice from '@/components/garden/GardenSalePrice';

// 판매가 설정 — 발주 기록의 드립 판매가 책정·공유 (발주와 권한 분리, saleprice 탭)
export default function GardenSalePricePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <GardenSalePrice />
      </div>
    </div>
  );
}
