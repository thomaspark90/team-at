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
        <h1 className="text-[15px] font-medium" style={{ marginBottom: 16 }}>
          분쇄도 측정 업로드 (EK43 지점 캘리브레이션)
        </h1>
        <GrindMeasurementUpload />
      </div>
    </div>
  );
}
