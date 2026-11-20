'use client';

import { useState } from 'react';
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
  // 휴대폰에서는 날씨·원두 사용량을 접어 두고 로고 오른쪽의 동그란 i 버튼으로 연다(2026-11-20 대표 지시). 넓은 화면은 항상 보인다.
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <PageShell nav={<GardenNav />}>
      {/* 머리줄(2026-11-20 대표 지시): 왼쪽엔 가든서비스 로고만, 날씨·원두 사용량은 오른쪽 정렬.
          좁은 화면에서는 오른쪽 묶음이 로고 아래로 내려가 폭 전체를 쓰고(basis 320px), 정렬은 그대로 오른쪽.
          로고는 초록 한 색 SVG(public/brand) — 일러스트 원본 GS Logo 에서 내보냄. 화면 이름은 "가든 홈"(내비 표기 "홈"). */}
      <header className="mb-10 flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        <h1 className="m-0 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/garden-service-logo.svg" alt="가든 서비스 홈" className="block h-12 w-auto" />
        </h1>
        <button
          type="button"
          aria-expanded={infoOpen}
          aria-controls="garden-home-info"
          aria-label={infoOpen ? '날씨·원두 사용량 접기' : '날씨·원두 사용량 보기'}
          onClick={() => setInfoOpen((v) => !v)}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-body shadow-soft-sm sm:hidden ${
            infoOpen ? 'bg-foreground text-background' : 'bg-background text-foreground'
          }`}
          style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
        >
          i
        </button>
        <div id="garden-home-info" className={`min-w-0 flex-1 basis-full sm:block sm:basis-[320px] ${infoOpen ? '' : 'hidden'}`}>
          <WeatherStrip compact alignEnd />
          <BeanUsageStrip alignEnd />
        </div>
      </header>
      <div className="space-y-12">
        <WorkBoard />
        <GardenDashboard section="unset" />
        <GardenOps />
      </div>
    </PageShell>
  );
}
