'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RATIO_STEPS, formatRatio } from '@/lib/garden/extraction-theory';
import { LAB_DOSE_G, SCHMIEDER_VARIANTS, type SchmiederVariant } from '@/lib/garden/extraction-lab';
import { GRID, ValueTip, axisTick } from './chart-shared';

// 같은 논문에서 분쇄·온도만 바꿔 다시 적합한 TDS 농도 곡선 — 세 선이 겹치는 것을 보여주는 그래프.
const OPACITY = [0.45, 0.7, 1];

function DecayChart({ variants, color }: { variants: SchmiederVariant[]; color: string }) {
  const data = RATIO_STEPS.map((ratio) => {
    const row: Record<string, number> = { ratio };
    variants.forEach((v, i) => (row[`v${i}`] = 100 * Math.exp(-(ratio * LAB_DOSE_G) / v.lambda)));
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="ratio" type="number" domain={[0, 3]} ticks={[0, 1, 2, 3]} interval={0} tickFormatter={formatRatio} tick={axisTick} stroke={GRID} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={GRID} width={44} />
        <Tooltip content={<ValueTip heading={(l) => formatRatio(Number(l))} digits={0} unit="%" />} cursor={{ stroke: 'var(--chart-axis-text)', strokeWidth: 1 }} />
        <Legend iconType="plainline" itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
        {variants.map((v, i) => (
          <Line key={v.label} dataKey={`v${i}`} name={`${v.label} λ ${v.lambda.toFixed(1)}`} type="monotone" stroke={color} strokeOpacity={OPACITY[i]} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GrindDecayChart() {
  return <DecayChart variants={SCHMIEDER_VARIANTS.grind} color="var(--chart-cat-4)" />;
}

export function TempDecayChart() {
  return <DecayChart variants={SCHMIEDER_VARIANTS.temp} color="var(--chart-cat-8)" />;
}
