'use client';

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  FLAVORS,
  RATIO_STEPS,
  ROASTS,
  flavorAt,
  formatRatio,
  ratioToSeconds,
  type FlavorKey,
  type RoastKey,
} from '@/lib/garden/extraction-theory';

// 배전도별 맛 모식도. 측정값이 아니므로 세로 눈금과 수치를 일부러 보여주지 않는다 — 툴팁도 높은 순서만 알려준다.
const GRID = 'var(--chart-grid-stroke)';
const axisTick = { fontSize: 12, fill: 'var(--chart-axis-text)' };
const DASH = '5 4';

function FlavorTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a: any, b: any) => b.value - a.value);
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-caption">
      <div className="text-muted-foreground">
        {formatRatio(label)} · 약 {Math.round(ratioToSeconds(label))}초
      </div>
      {rows.map((r: any) => (
        <div key={r.dataKey} className="mt-0.5 flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: r.stroke }} />
          {r.name}
        </div>
      ))}
    </div>
  );
}

function RoastChart({ roast, focus }: { roast: RoastKey; focus: FlavorKey | null }) {
  const data = RATIO_STEPS.map((ratio) => ({ ratio, ...flavorAt(roast, ratio) }));
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 30 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          dataKey="ratio"
          type="number"
          domain={[0, 3]}
          ticks={[0, 1, 2, 3]}
          interval={0}
          tickFormatter={formatRatio}
          tick={axisTick}
          stroke={GRID}
        />
        <YAxis hide domain={[0, 1.05]} />
        <Tooltip content={<FlavorTip />} cursor={{ stroke: 'var(--chart-axis-text)', strokeWidth: 1 }} />
        {FLAVORS.map((f) => (
          <Line
            key={f.key}
            dataKey={f.key}
            name={f.label}
            type="monotone"
            stroke={f.color}
            strokeWidth={2}
            strokeDasharray={f.shapeMeasured ? undefined : DASH}
            strokeOpacity={focus && focus !== f.key ? 0.15 : 1}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function RoastFlavorCharts() {
  const [focus, setFocus] = useState<FlavorKey | null>(null);
  return (
    <div>
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {FLAVORS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={focus === f.key}
            // 터치의 합성 hover 가 탭 토글을 되돌리지 않도록 마우스일 때만 hover 로 강조한다
            onPointerEnter={(e) => e.pointerType === 'mouse' && setFocus(f.key)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setFocus(null)}
            onClick={() => setFocus(focus === f.key ? null : f.key)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-2 text-body hover:bg-accent md:py-1 ${focus === f.key ? 'bg-accent' : ''}`}
          >
            <svg width="20" height="4" aria-hidden="true">
              <line
                x1="0"
                y1="2"
                x2="20"
                y2="2"
                stroke={f.color}
                strokeWidth="2"
                strokeDasharray={f.shapeMeasured ? undefined : '4 3'}
              />
            </svg>
            {f.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-x-4 gap-y-6 md:grid-cols-3 lg:gap-x-8">
        {ROASTS.map((r) => (
          <figure key={r.key} className="m-0 min-w-0">
            <figcaption className="mb-1">
              <span className="text-title">{r.label}</span>
            </figcaption>
            <RoastChart roast={r.key} focus={focus} />
          </figure>
        ))}
      </div>
    </div>
  );
}
