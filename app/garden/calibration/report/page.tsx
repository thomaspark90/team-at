'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import dynamic from 'next/dynamic';

// recharts 포함 리포트 번들은 별도 청크로 지연 로드 — 페이지 뼈대가 먼저 그려진다
const GrindCalibrationReport = dynamic(() => import('@/components/garden/GrindCalibrationReport'), {
  ssr: false,
  loading: () => <p className="text-[13px] text-muted-foreground">리포트 불러오는 중…</p>,
});

export default function GrindCalibrationReportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <h1 className="text-[18px] font-medium" style={{ marginBottom: 4 }}>
          EK43 지점 캘리브레이션 리포트 — 양재천 vs 판교
        </h1>
        <p className="text-[13px] text-muted-foreground" style={{ marginTop: 0, marginBottom: 20 }}>
          2026-07-16 측정 · 교육용 자료 · 문의는 대표에게
        </p>
        <GrindCalibrationReport />
      </div>
    </div>
  );
}
