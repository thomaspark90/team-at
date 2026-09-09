'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenDashboard from '@/components/garden/GardenDashboard';
import GardenOps from '@/components/garden/GardenOps';
import WeatherStrip from '@/components/garden/WeatherStrip';
import WorkBoard from '@/components/garden/WorkBoard';

// 가든 작업 보드 — 2026-09-09 소프트 UI 4단계: 행동이 위, 참고는 한 줄.
//  · 제목 아래 날씨는 오늘·내일 한 줄(WeatherStrip compact) — 2주 예보는 눌러야 펼쳐진다.
//  · 내 차례가 주 패널로 맨 위, 팀 전체 보드는 접힌 한 줄(WorkBoard 안에서 처리).
//  · 그 아래 미설정 원두·그라인더 캘리브레이션은 그대로, 구분선 없이 간격으로만 나눈다.
export default function GardenPage() {
  return (
    <PageShell nav={<GardenNav />} title="작업 보드" subtitle={<WeatherStrip compact />}>
      <div className="space-y-12">
        <WorkBoard />
        <GardenDashboard section="unset" />
        <GardenOps />
      </div>
    </PageShell>
  );
}
