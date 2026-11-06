'use client';

import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CAMERON, CAMERON_PEAK_GS, cameronModelEy } from '@/lib/garden/extraction-lab';
import { GRID, ValueTip, axisTick } from './chart-shared';

// Cameron 2020 — 분쇄 설정별 샷 시간(직선)과 수율(봉우리 + ±SD 띠 + 모델 점선).
const GS_TICKS = CAMERON.map((p) => p.gs);
const X = { dataKey: 'gs', type: 'number' as const, domain: [1.0, 2.4] as [number, number], ticks: GS_TICKS, tickFormatter: (v: number) => v.toFixed(1), tick: axisTick, stroke: GRID };
const heading = (l: number | string) => `EK43 ${Number(l).toFixed(1)}`;
const LINE = 'var(--chart-cat-1)';

function EdgeLabels() {
  // 축 아래 "◀ 곱게 / 굵게 ▶" — recharts 라벨 대신 캡션으로 둔다
  return (
    <div className="-mt-1 flex justify-between px-11 text-caption text-muted-foreground">
      <span>◀ 곱게</span>
      <span>EK43 설정</span>
      <span>굵게 ▶</span>
    </div>
  );
}

export function CameronTimeChart() {
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={CAMERON} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis {...X} />
          <YAxis domain={[20, 40]} ticks={[20, 25, 30, 35, 40]} tickFormatter={(v) => `${v}s`} tick={axisTick} stroke={GRID} width={44} />
          <Tooltip content={<ValueTip heading={heading} digits={1} unit="s" />} cursor={{ stroke: 'var(--chart-axis-text)', strokeWidth: 1 }} />
          <Line dataKey="timeS" name="샷 시간" stroke={LINE} strokeWidth={2} dot={{ r: 3, fill: LINE, strokeWidth: 0 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <EdgeLabels />
    </>
  );
}

export function CameronYieldChart() {
  const data = CAMERON.map((p) => ({
    ...p,
    band: [p.ey - p.sd, p.ey + p.sd] as [number, number],
    model: cameronModelEy(p.gs),
    // 모델이 예측한 수율과 실측 사이 — 봉우리까지만 음영
    gap: p.gs <= CAMERON_PEAK_GS ? ([p.ey, cameronModelEy(p.gs)] as [number, number]) : null,
  }));
  const peak = CAMERON.find((p) => p.gs === CAMERON_PEAK_GS)!;
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis {...X} />
          <YAxis domain={[19, 26]} ticks={[19, 21, 23, 25]} tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={GRID} width={44} />
          <Tooltip content={<ValueTip heading={heading} digits={2} unit="%" />} cursor={{ stroke: 'var(--chart-axis-text)', strokeWidth: 1 }} />
          <Area dataKey="gap" name="모델−실측" fill="var(--chart-cat-6)" fillOpacity={0.08} stroke="none" isAnimationActive={false} legendType="none" tooltipType="none" />
          <Area dataKey="band" name="±1 SD" fill={LINE} fillOpacity={0.15} stroke="none" isAnimationActive={false} legendType="none" tooltipType="none" />
          <Line dataKey="model" name="균질 흐름 모델(20 g)" stroke="var(--chart-axis-text)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line dataKey="ey" name="수율" stroke={LINE} strokeWidth={2} dot={{ r: 3, fill: LINE, strokeWidth: 0 }} isAnimationActive={false} />
          <ReferenceDot x={peak.gs} y={peak.ey} r={0} label={{ value: `${peak.ey}% 최대`, position: 'top', fontSize: 12, fill: 'var(--foreground)' }} />
        </ComposedChart>
      </ResponsiveContainer>
      <EdgeLabels />
    </>
  );
}
