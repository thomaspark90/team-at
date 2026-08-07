'use client';

import dynamic from 'next/dynamic';
import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GrindMeasurementUpload from '@/components/garden/GrindMeasurementUpload';
import GrinderAlignmentLog from '@/components/garden/GrinderAlignmentLog';

// recharts 포함 차트 번들은 별도 청크로 지연 로드 — 업로드 창이 먼저 그려진다
const GrindCalibrationCharts = dynamic(() => import('@/components/garden/GrindCalibrationCharts'), {
  ssr: false,
  loading: () => <p className="text-[13px] text-muted-foreground">차트 불러오는 중…</p>,
});

export default function GardenCalibrationPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="text-[15px] font-medium" style={{ margin: 0 }}>
            분쇄도 측정 업로드 (EK43 지점 캘리브레이션)
          </h1>
          <a href="/garden/calibration/report" className="text-[13px] underline text-muted-foreground hover:text-foreground">
            2026-07-16 기준선 리포트 보기 →
          </a>
        </div>

        {/* 지점별 얼라인먼트 날짜 기록 */}
        <GrinderAlignmentLog />

        {/* 측정 업로드 */}
        <GrindMeasurementUpload />

        {/* 이전 자료 + 신규 측정 시각화 */}
        <GrindCalibrationCharts />
      </div>
    </div>
  );
}
