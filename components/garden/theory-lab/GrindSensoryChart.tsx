'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KHU_ATTRS, KHU_LEVELS, KHU_MEASURED } from '@/lib/garden/extraction-lab';
import { GRID, ValueTip, axisTick } from './chart-shared';

// 경희대 2011 — 분쇄 3단계 관능 강도. 유의한 항목(산미·떫은맛)만 진하게, 나머지는 옅게.
const NS_OPACITY = 0.25;

export function GrindSensoryChart() {
  const data = KHU_LEVELS.map((level, i) => {
    const row: Record<string, string | number> = { level };
    KHU_ATTRS.forEach((a) => (row[a.key] = a.values[i]));
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={3}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="level" tick={axisTick} stroke={GRID} />
        <YAxis domain={[0, 12]} ticks={[0, 3, 6, 9, 12]} tick={axisTick} stroke={GRID} width={44} />
        <Tooltip content={<ValueTip heading={(l) => String(l)} digits={2} />} cursor={{ fill: 'var(--chart-grid-stroke)', fillOpacity: 0.4 }} />
        <Legend iconType="square" itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
        {KHU_ATTRS.map((a) => (
          <Bar key={a.key} dataKey={a.key} name={a.sig ? a.label : `${a.label} (n.s.)`} fill={a.color} isAnimationActive={false} legendType="square">
            {KHU_LEVELS.map((level) => (
              <Cell key={level} fillOpacity={a.sig ? 1 : NS_OPACITY} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

const th = 'px-3 py-1.5 text-left text-caption font-normal tracking-[0.04em] text-muted-foreground';
const td = 'border-t border-border px-3 py-1.5 align-top text-body';

export function GrindMeasuredTable() {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={th}></th>
          {KHU_LEVELS.map((l) => (
            <th key={l} className={`${th} text-right`}>{l}</th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular">
        {KHU_MEASURED.map((r) => (
          <tr key={r.label}>
            <td className={td}>{r.label}</td>
            {r.values.map((v, i) => (
              <td key={i} className={`${td} text-right ${r.label.startsWith('CATA') ? 'text-muted-foreground' : ''}`}>{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
