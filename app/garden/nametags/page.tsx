'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import NametagPicker from '@/components/garden/nametags/NametagPicker';

// 브런치 네임택 — 필요한 메뉴만 골라 그래픽 담당에게 프린트를 요청한다(가든 양재 브런치 바).
export default function GardenNametagsPage() {
  return (
    <PageShell nav={<GardenNav />} title="브런치 네임택" subtitle="새로 뽑아야 하는 메뉴만 체크해서 한 번에 요청하세요. 요청하면 그래픽 담당에게 알림이 갑니다.">
      <NametagPicker />
    </PageShell>
  );
}
