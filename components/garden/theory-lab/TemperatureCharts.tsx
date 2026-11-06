'use client';

import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TEMP_SWEEPS, type TempSweep } from '@/lib/garden/extraction-lab';
import { GRID, ValueTip, axisTick } from './chart-shared';

// 매장 굴절계 온도 스윕 — 자료마다 별도 소패널. 한 선으로 잇지 않는다.
function SweepChart({ sweep }: { sweep: TempSweep }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={sweep.points} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="c" type="number" domain={[86, 99]} ticks={sweep.points.map((p) => p.c)} tickFormatter={(v) => `${v}°`} tick={axisTick} stroke={GRID} />
        <YAxis domain={sweep.domain} ticks={sweep.ticks} tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={GRID} width={44} />
        <Tooltip content={<ValueTip heading={(l) => `${l} °C`} digits={2} unit="%" />} cursor={{ stroke: 'var(--chart-axis-text)', strokeWidth: 1 }} />
        <Line dataKey="v" name={sweep.unit} stroke={sweep.color} strokeWidth={2} dot={{ r: 3, fill: sweep.color, strokeWidth: 0 }} isAnimationActive={false}>
          <LabelList dataKey="v" position="top" offset={8} fontSize={11} fill="var(--chart-axis-text)" formatter={(v: unknown) => Number(v).toFixed(2)} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function TemperatureCharts() {
  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
      {TEMP_SWEEPS.map((s) => (
        <figure key={s.id} className="m-0 min-w-0">
          <figcaption className="mb-2 text-body">
            {s.title} — {s.unit}
          </figcaption>
          <SweepChart sweep={s} />
          <p className="mb-0 mt-2 text-caption text-muted-foreground">{s.note}</p>
        </figure>
      ))}
    </div>
  );
}
