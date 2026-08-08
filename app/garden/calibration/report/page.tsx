'use client';

import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import dynamic from 'next/dynamic';

// recharts 포함 리포트 번들은 별도 청크로 지연 로드 — 페이지 뼈대가 먼저 그려진다
const GrindCalibrationReport = dynamic(() => import('@/components/garden/GrindCalibrationReport'), {
  ssr: false,
  loading: () => <p className="text-[13px] text-muted-foreground">리포트 불러오는 중…</p>,
});
const GrindCalibrationReportLive = dynamic(
  () => import('@/components/garden/GrindCalibrationReportLive'),
  {
    ssr: false,
    loading: () => <p className="text-[13px] text-muted-foreground">현행 측정 불러오는 중…</p>,
  }
);

export default function GrindCalibrationReportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <h1 className="text-[22px] font-medium" style={{ marginBottom: 4 }}>
          EK43 지점 캘리브레이션 리포트 — 양재천 vs 판교
        </h1>
        <p className="text-[13px] text-muted-foreground" style={{ marginTop: 0, marginBottom: 20 }}>
          최근 얼라인 이후 측정을 자동 반영 · 문의는 대표에게
        </p>
        <GrindCalibrationReportLive />

        <h2 className="text-[15px] font-medium" style={{ marginTop: 40, marginBottom: 4 }}>
          아카이브 — 2026-07-16 기준선 리포트
        </h2>
        <p className="text-[13px] text-muted-foreground" style={{ marginTop: 0, marginBottom: 20 }}>
          판교 재정렬(2026-08-07) 이전 측정 기록입니다. 왜 다이얼을 그대로 옮기면 안 되는지 보여주는
          교육 자료로 남겨두며, 현행 수치는 위 섹션이 기준입니다.
        </p>
        <GrindCalibrationReport />
      </div>
    </div>
  );
}
