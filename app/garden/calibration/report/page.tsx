'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GrindCalibrationReport from '@/components/garden/GrindCalibrationReport';

export default function GrindCalibrationReportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <h1 className="text-[15px] font-medium" style={{ marginBottom: 4 }}>
          EK43 지점 캘리브레이션 리포트 — 양재천 vs 판교
        </h1>
        <p className="text-[12px] text-muted-foreground" style={{ marginTop: 0, marginBottom: 16 }}>
          2026-07-16 측정 · 교육용 자료 · 문의는 대표에게
        </p>
        <GrindCalibrationReport />
      </div>
    </div>
  );
}
