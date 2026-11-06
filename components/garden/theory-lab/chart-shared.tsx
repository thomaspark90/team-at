'use client';

// theory-lab 차트 공통 — 기존 MeasuredCharts 와 같은 토큰을 쓴다.
export const GRID = 'var(--chart-grid-stroke)';
export const axisTick = { fontSize: 12, fill: 'var(--chart-axis-text)' };

type TipProps = {
  active?: boolean;
  payload?: { dataKey?: string | number; name?: string; value?: number | number[]; stroke?: string; fill?: string; strokeOpacity?: number }[];
  label?: number | string;
  heading: (label: number | string) => string;
  digits?: number;
  unit?: string;
};

export function ValueTip({ active, payload, label, heading, digits = 1, unit = '' }: TipProps) {
  if (!active || !payload?.length || label === undefined) return null;
  const rows = payload.filter((r) => typeof r.value === 'number');
  if (!rows.length) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-caption">
      <div className="text-muted-foreground">{heading(label)}</div>
      {rows.map((r) => (
        <div key={String(r.dataKey)} className="mt-0.5 flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: r.stroke ?? r.fill, opacity: r.strokeOpacity ?? 1 }} />
          <span className="tabular font-medium">
            {(r.value as number).toFixed(digits)}
            {unit}
          </span>
          <span className="text-muted-foreground">{r.name}</span>
        </div>
      ))}
    </div>
  );
}
