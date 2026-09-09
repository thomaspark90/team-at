'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenSalePrice from '@/components/garden/GardenSalePrice';

// 판매가 설정 — 발주 기록의 드립 판매가 책정·공유 (발주와 권한 분리, saleprice 탭)
export default function GardenSalePricePage() {
  return (
    <PageShell nav={<GardenNav />} width="wide">
      <GardenSalePrice />
    </PageShell>
  );
}
