'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { aggregate, type AggTx, type AggCat, type Unit } from '@/lib/finance/aggregate';

const won = (n: number) => n.toLocaleString('ko-KR');
const manwon = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000).toLocaleString()}만` : String(v));

const GRID = 'var(--chart-grid-stroke)';
const AXIS = 'var(--chart-axis-text)';
const REF = 'var(--chart-reference-line-stroke)';
const LINE = 'var(--chart-actual-line)';
const LINE2 = 'var(--chart-line-secondary)';
const BAR = 'var(--chart-bar-fill)';
const BAR2 = 'var(--chart-bar-fill-secondary)';

const axisTick = { fontSize: 11, fill: AXIS };

function ChartTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] shadow-none">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3 tabular text-foreground">
          <span className="text-muted-foreground">{p.name}</span>
          <span>{fmt ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ txns, cats }: { txns: AggTx[]; cats: AggCat[] }) {
  const [unit, setUnit] = useState<Unit>('month');
  const { months, expenseKeys } = useMemo(() => aggregate(txns, cats, unit), [txns, cats, unit]);

  const fmtP = (key: string) => (unit === 'month' ? key.slice(2).replace('-', '.') : key.slice(5).replace('-', '/'));

  const toggle = (
    <div className="inline-flex gap-1 rounded-md border border-border p-1">
      {(['month', 'week'] as Unit[]).map((u) => {
        const on = unit === u;
        return (
          <button
            key={u}
            onClick={() => setUnit(u)}
            className={`rounded-sm px-3 py-1 text-[13px] transition-colors ${
              on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {u === 'month' ? '월 단위' : '주 단위 (W)'}
          </button>
        );
      })}
    </div>
  );

  if (months.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {toggle}
        <div className="mx-auto my-10 max-w-[460px] text-center text-muted-foreground">
          <div className="mb-3 text-[32px]">📊</div>
          <h2 className="mb-2 text-[18px] text-foreground">표시할 데이터가 없어요</h2>
          <p className="text-[14px]">거래를 분류하면 매출·지출·손익 그래프가 여기 그려져요.</p>
        </div>
      </div>
    );
  }

  const last = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;
  const avgRev = months.reduce((a, m) => a + m.revenue, 0) / months.length;

  const lineData = months.map((m) => ({ p: fmtP(m.ym), 매출: m.revenue, EBIT: m.ebit, 순이익: m.net }));
  const ratioData = months.map((m) => ({ p: fmtP(m.ym), 손익률: m.profitRatio != null ? +(m.profitRatio * 100).toFixed(1) : null }));
  const costData = months.map((m) => ({ p: fmtP(m.ym), 재료비율: m.costRatio != null ? +(m.costRatio * 100).toFixed(1) : null }));
  const barData = months.map((m) => ({ p: fmtP(m.ym), ...m.expense }));

  const lastExpense = last.cogs + last.sga;
  const prevExpense = prev ? prev.cogs + prev.sga : null;
  const unitLabel = unit === 'month' ? '이번 달' : '이번 주';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Stat label={`${unitLabel} 매출`} value={won(last.revenue)} delta={delta(last.revenue, prev?.revenue)} />
          <Stat label="지출(원가+판관비)" value={won(lastExpense)} delta={delta(lastExpense, prevExpense)} />
          <Stat label="영업이익(EBIT)" value={won(last.ebit)} delta={delta(last.ebit, prev?.ebit)} />
          <Stat label="당기순이익" value={won(last.net)} delta={delta(last.net, prev?.net)} />
        </div>
        {toggle}
      </div>

      <ChartCard title="매출 추이" subtitle="점선=평균">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
            <ReferenceLine y={avgRev} stroke={REF} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="매출" stroke={LINE} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="영업이익 추이" subtitle="EBIT · 당기순이익">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
            <ReferenceLine y={0} stroke={REF} />
            <Line type="monotone" dataKey="EBIT" stroke={LINE} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="순이익" stroke={LINE2} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="손익 추이 %" subtitle="영업이익률 = EBIT ÷ 매출">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={ratioData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={AXIS} width={44} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => `${v}%`} />} />
            <ReferenceLine y={0} stroke={REF} />
            <Line type="monotone" dataKey="손익률" stroke={LINE} strokeWidth={1.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="지출 구분" subtitle="카테고리별 지출(누적)">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
            <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
            {expenseKeys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="a" fill={i % 2 === 0 ? BAR : BAR2} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="재료비 %" subtitle="원가율 = 재료비 ÷ 매출 · 카페 벤치마크 25~37%">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={costData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={AXIS} width={44} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => `${v}%`} />} />
            <ReferenceLine y={37} stroke={REF} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="재료비율" stroke={LINE} strokeWidth={1.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <p className="m-0 text-[12px] text-muted-foreground">
        * 매출은 입금액 기준(부가세 포함). 자본적지출·보증금·내부이체는 손익에서 제외. 감가상각 미반영(EBIT=EBITDA).
      </p>
    </div>
  );
}

function delta(cur: number, prevV: number | null | undefined): string | null {
  if (prevV == null || prevV === 0) return null;
  const r = ((cur - prevV) / Math.abs(prevV)) * 100;
  return `${r >= 0 ? '▲' : '▼'} ${Math.abs(r).toFixed(0)}%`;
}

function Stat({ label, value, delta }: { label: string; value: string; delta: string | null }) {
  return (
    <div className="ta-card min-w-[150px] flex-[1_1_auto] p-[14px_18px]">
      <div className="mb-[5px] text-[11px] text-muted-foreground">{label}</div>
      <div className="tabular text-[20px] text-foreground">{value}</div>
      {delta && <div className="mt-[3px] text-[11px] text-muted-foreground">전기 {delta}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="ta-card p-[18px_16px_12px]">
      <div className="px-1.5 pb-3">
        <h3 className="m-0 text-[15px] text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
