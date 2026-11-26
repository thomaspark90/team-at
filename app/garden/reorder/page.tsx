'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import ReorderManager from '@/components/garden/reorder/ReorderManager';

// 발주(반복 발주 최저가) — 1단계 품목표. 대표·매니저 전용(가든 탭 reorder, API 가 강제). 기획: docs/prd-garden-reorder.md
export default function GardenReorderPage() {
  return (
    <PageShell
      nav={<GardenNav />}
      title="발주"
      subtitle="자주 사는 재료의 품목표입니다. 금액은 결제 한 건의 총액(원)이며, 결제 기록에는 수량이 없습니다."
    >
      <ReorderManager />
    </PageShell>
  );
}
