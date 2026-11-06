'use client';

import { CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  SCHMIEDER_FIT,
  VOLATILES,
  VOLATILE_TIMES,
  RATIO_STEPS,
  formatRatio,
  relativeConcentration,
  type CompoundKey,
} from '@/lib/garden/extraction-theory';

// 측정 차트 두 개 — 지금 떨어지는 액체의 농도(비휘발)와 향 성분 신호(휘발).
// 측정 방식과 기준이 달라 한 축에 합치지 않는다.
const GRID = 'var(--chart-grid-stroke)';
const axisTick = { fontSize: 12, fill: 'var(--chart-axis-text)' };

// 맛 차트와 연결되는 색을 쓴다: 트리고넬린↔산미 대용, 카페인↔쓴맛
const COMPOUND_COLOR: Record<CompoundKey, string> = {
  tds: 'var(--chart-cat-4)',
  trigonelline: 'var(--chart-cat-1)',
  cqa: 'var(--chart-cat-8)',
  caffeine: 'var(--chart-cat-5)',
};

function ValueTip({ active, payload, label, heading, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-caption">
      <div className="text-muted-foreground">{heading(label)}</div>
      {payload.map((r: any) => (
        <div key={r.dataKey} className="mt-0.5 flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: r.stroke, opacity: r.strokeOpacity ?? 1 }} />
          <span className="tabular font-medium">
            {r.value.toFixed(unit === '%' ? 0 : 2)}
            {unit}
          </span>
          <span className="text-muted-foreground">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

export function ConcentrationChart() {
  const keys = Object.keys(SCHMIEDER_FIT) as CompoundKey[];
  const data = RATIO_STEPS.map((ratio) => {
    const row: Record<string, number> = { ratio };
    keys.forEach((k) => (row[k] = relativeConcentration(k, ratio * 20)));
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="ratio" type="number" domain={[0, 3]} ticks={[0, 1, 2, 3]} interval={0} tickFormatter={formatRatio} tick={axisTick} stroke={GRID} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={GRID} width={44} />
        <Tooltip
          content={<ValueTip unit="%" heading={formatRatio} />}
          cursor={{ stroke: 'var(--chart-axis-text)', strokeWidth: 1 }}
        />
        <Legend iconType="plainline" itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k) => (
          <Line key={k} dataKey={k} name={SCHMIEDER_FIT[k].label} type="monotone" stroke={COMPOUND_COLOR[k]} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// 5개 계열 중 성격이 뚜렷한 3개만 그린다(B·C 는 A 와 D 사이)
const FAMILY_LINES = [
  { key: 'A', short: '가벼운 향', label: '가벼운 향(초산 등)', opacity: 0.4, labelAt: 10 },
  { key: 'D', short: '중간', label: '중간(퓨란 등)', opacity: 0.7, labelAt: 16 },
  { key: 'E', short: '무거운 향', label: '무거운 향(페놀류)', opacity: 1, labelAt: 24 },
] as const;

export function VolatileChart() {
  const data = VOLATILE_TIMES.map((t, i) => ({ t, A: VOLATILES.A[i], D: VOLATILES.D[i], E: VOLATILES.E[i] }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="t" type="number" domain={[0, 26]} ticks={[0, 6, 10, 15, 20, 26]} tickFormatter={(v) => `${v}s`} tick={axisTick} stroke={GRID} />
        <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} stroke={GRID} width={44} />
        <Tooltip
          content={<ValueTip unit="" heading={(t: number) => `펌프 시작 후 ${t}초`} />}
          cursor={{ stroke: 'var(--chart-axis-text)', strokeWidth: 1 }}
        />
        <Legend iconType="plainline" itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
        {FAMILY_LINES.map((f) => (
          <Line key={f.key} dataKey={f.key} name={f.label} type="monotone" stroke="var(--chart-cat-2)" strokeOpacity={f.opacity} strokeWidth={2} dot={false} isAnimationActive={false}>
            <LabelList
              dataKey={f.key}
              content={({ x, y, index }: any) =>
                VOLATILE_TIMES[index] === f.labelAt ? (
                  <text x={x} y={y - 8} textAnchor="middle" fontSize={12} fill="var(--chart-axis-text)">
                    {f.short}
                  </text>
                ) : null
              }
            />
          </Line>
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
