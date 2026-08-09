'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bucketLabel, type MenuPeriod } from '@/lib/garden/menu-sales';

// 메뉴별 판매 추이 — 라인 차트(가든 매출 페이지). 캘리브레이션 리포트(GrindCalibrationCharts)와
// 같은 색 토큰(--chart-cat-N)·그리드·범례 문법을 따른다. 상위 메뉴(최대 8개)를 색상별 라인으로.

const CAT = [
  'var(--chart-cat-1)',
  'var(--chart-cat-2)',
  'var(--chart-cat-3)',
  'var(--chart-cat-4)',
  'var(--chart-cat-5)',
  'var(--chart-cat-6)',
  'var(--chart-cat-7)',
  'var(--chart-cat-8)',
];
const GRID = 'var(--chart-grid-stroke)';
const AXIS = 'var(--chart-axis-text)';
const axisTick = { fontSize: 12, fill: AXIS };

const cnt = (n: number) => Math.round(n).toLocaleString('ko-KR');

function TrendTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {payload
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3 tabular text-foreground">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.stroke }} aria-hidden />
              {p.name}
            </span>
            <span>{cnt(p.value)}건</span>
          </div>
        ))}
    </div>
  );
}

export default function MenuTrendChart({ menus }: { menus: MenuPeriod }) {
  const { buckets, menus: series, gran } = menus;
  if (series.length === 0) return null;

  const data = buckets.map((b, i) => {
    const row: Record<string, number | string> = { label: bucketLabel(b, gran) };
    for (const s of series) row[s.label] = s.qty[i];
    return row;
  });

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={axisTick} stroke={AXIS} interval="preserveStartEnd" />
          <YAxis tick={axisTick} stroke={AXIS} allowDecimals={false} />
          <Tooltip content={<TrendTip />} />
          <Legend wrapperStyle={{ fontSize: 13 }} iconType="circle" />
          {series.map((s, i) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              name={s.label}
              stroke={CAT[i % CAT.length]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: CAT[i % CAT.length] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
