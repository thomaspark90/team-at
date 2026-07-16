'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import GrindMeasurementUpload from '@/components/garden/GrindMeasurementUpload';

export default function GardenCalibrationPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h1 className="text-[15px] font-medium" style={{ margin: 0 }}>
            분쇄도 측정 업로드 (EK43 지점 캘리브레이션)
          </h1>
          <a href="/garden/calibration/report" className="text-[13px] underline text-muted-foreground hover:text-foreground">
            캘리브레이션 리포트 보기 →
          </a>
        </div>
        <GrindMeasurementUpload />
      </div>
    </div>
  );
}
