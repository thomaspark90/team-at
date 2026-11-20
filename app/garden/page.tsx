'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import GardenDashboard from '@/components/garden/GardenDashboard';
import GardenOps from '@/components/garden/GardenOps';
import WeatherStrip from '@/components/garden/WeatherStrip';
import BeanUsageStrip from '@/components/garden/BeanUsageStrip';
import WorkBoard from '@/components/garden/WorkBoard';

// 가든 홈(옛 이름 "작업 보드") — 2026-09-09 소프트 UI 4단계: 행동이 위, 참고는 한 줄.
//  · 제목 아래 날씨는 오늘·내일 한 줄(WeatherStrip compact) — 2주 예보는 눌러야 펼쳐진다.
//  · 날씨 줄 바로 아래 원두 일 사용량 한 줄(BeanUsageStrip, kg/일 주중·주말) — 1kg 단위 발주 참고(2026-09-13).
//  · 내 차례가 주 패널로 맨 위, 팀 전체 보드는 접힌 한 줄(WorkBoard 안에서 처리).
//  · 그 아래 미설정 원두·그라인더 캘리브레이션은 그대로, 구분선 없이 간격으로만 나눈다.
export default function GardenPage() {
  return (
    <PageShell
      nav={<GardenNav />}
      // 제목 = 가든서비스 로고 + "홈" (2026-11-20 대표 결정: "작업 보드" → "가든 홈", "가든" 글자 자리에 로고).
      // 로고 아랫선이 글자 밑선과 맞도록 items-end. 로고는 초록 한 색 SVG(public/brand) — 일러스트 원본 GS Logo 에서 내보냄.
      title={
        <span className="flex items-end gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/garden-service-logo.svg" alt="가든 서비스" className="block h-11 w-auto" />
          <span className="leading-none">홈</span>
        </span>
      }
      subtitleWide
      subtitle={
        <>
          <WeatherStrip compact />
          <BeanUsageStrip />
        </>
      }
    >
      <div className="space-y-12">
        <WorkBoard />
        <GardenDashboard section="unset" />
        <GardenOps />
      </div>
    </PageShell>
  );
}
