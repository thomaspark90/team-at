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
  LabelList,
} from 'recharts';
import { aggregate, type AggTx, type AggCat, type Unit } from '@/lib/finance/aggregate';

const won = (n: number) => n.toLocaleString('ko-KR');
const manwon = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000).toLocaleString()}만` : String(v));

const GRID = 'var(--chart-grid-stroke)';
const AXIS = 'var(--chart-axis-text)';
const REF = 'var(--chart-reference-line-stroke)';
const LINE = 'var(--chart-actual-line)';
const LINE2 = 'var(--chart-line-secondary)';
// 지출 구분(카테고리) 색 — dataviz 검증 팔레트, 고정 순서로만 쓰고 순환 금지
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
const CAT_OTHER = 'var(--chart-cat-other)';
const CAT_SURFACE = 'var(--chart-surface)';
const CAT_MAX = 8; // 8색까지, 초과 카테고리는 '기타'로 접음

const axisTick = { fontSize: 11, fill: AXIS };
// x축 각 지점마다 상시 노출하는 값 라벨 스타일
const pointLabel = { fontSize: 10, fill: AXIS };
const wonLabel = (v: any) => (v == null ? '' : manwon(Number(v)));
const pctLabel = (v: any) => (v == null ? '' : `${v}%`);

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
  const [netVat, setNetVat] = useState(true);
  const { months, expenseKeys } = useMemo(() => aggregate(txns, cats, unit, netVat), [txns, cats, unit, netVat]);

  const fmtP = (key: string) => (unit === 'month' ? key.slice(2).replace('-', '.') : key.slice(5).replace('-', '/'));

  const toggle = (
    <div className="flex flex-wrap items-center gap-2">
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
      <div className="inline-flex gap-1 rounded-md border border-border p-1">
        {([true, false] as boolean[]).map((v) => {
          const on = netVat === v;
          return (
            <button
              key={String(v)}
              onClick={() => setNetVat(v)}
              className={`rounded-sm px-3 py-1 text-[13px] transition-colors ${
                on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={v ? '매출을 공급가액(총액÷1.1)으로 집계' : '매출을 통장 입금액(VAT 포함) 그대로 집계'}
            >
              {v ? '부가세 순액' : '총액'}
            </button>
          );
        })}
      </div>
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
  // 지출 카테고리를 총액 큰 순으로 세우고, 8색을 넘기면 나머지는 '기타'로 접음(색 순환·중복 방지)
  const totalByKey: Record<string, number> = {};
  for (const m of months) for (const k of expenseKeys) totalByKey[k] = (totalByKey[k] || 0) + (m.expense[k] || 0);
  const ranked = [...expenseKeys].filter((k) => (totalByKey[k] || 0) > 0).sort((a, b) => (totalByKey[b] || 0) - (totalByKey[a] || 0));
  const hasOther = ranked.length > CAT_MAX;
  const topKeys = hasOther ? ranked.slice(0, CAT_MAX - 1) : ranked;
  const otherKeys = hasOther ? ranked.slice(CAT_MAX - 1) : [];
  const barKeys = hasOther ? [...topKeys, '기타'] : topKeys;
  const colorOf = (k: string, i: number) => (k === '기타' ? CAT_OTHER : CAT[i]);
  const barData = months.map((m) => {
    const row: Record<string, number | string> = { p: fmtP(m.ym), 총지출: m.cogs + m.sga };
    for (const k of topKeys) row[k] = m.expense[k] || 0;
    if (hasOther) row['기타'] = otherKeys.reduce((s, k) => s + (m.expense[k] || 0), 0);
    return row;
  });
  // 항목별 비중(전체 기간 지출 대비 %) — 지출 구분 차트 옆 리스트
  const valueOf = (k: string) => (k === '기타' ? otherKeys.reduce((s, kk) => s + (totalByKey[kk] || 0), 0) : totalByKey[k] || 0);
  const grandExpense = barKeys.reduce((s, k) => s + valueOf(k), 0);
  const breakdown = barKeys.map((k, i) => {
    const value = valueOf(k);
    return { name: k, value, pct: grandExpense > 0 ? (value / grandExpense) * 100 : 0, color: colorOf(k, i) };
  });

  const lastExpense = last.cogs + last.sga;
  const prevExpense = prev ? prev.cogs + prev.sga : null;
  const unitLabel = unit === 'month' ? '이번 달' : '이번 주';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Stat label={`${unitLabel} 매출${netVat ? ' (순액)' : ''}`} value={won(last.revenue)} delta={delta(last.revenue, prev?.revenue)} />
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
            <Line type="monotone" dataKey="매출" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }}>
              <LabelList dataKey="매출" position="top" offset={8} formatter={wonLabel} style={pointLabel} />
            </Line>
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
            <Line type="monotone" dataKey="EBIT" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }}>
              <LabelList dataKey="EBIT" position="top" offset={8} formatter={wonLabel} style={pointLabel} />
            </Line>
            <Line type="monotone" dataKey="순이익" stroke={LINE2} strokeWidth={1.5} dot={{ r: 2, fill: LINE2 }}>
              <LabelList dataKey="순이익" position="bottom" offset={8} formatter={wonLabel} style={pointLabel} />
            </Line>
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
            <Line type="monotone" dataKey="손익률" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }} connectNulls>
              <LabelList dataKey="손익률" position="top" offset={8} formatter={pctLabel} style={pointLabel} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="지출 구분" subtitle="카테고리별 지출(누적) · 옆은 전체 기간 비중">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
                <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
                <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
                {barKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={colorOf(k, i)} stroke={CAT_SURFACE} strokeWidth={1}>
                    {i === barKeys.length - 1 && (
                      <LabelList dataKey="총지출" position="top" offset={6} formatter={wonLabel} style={pointLabel} />
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex w-full shrink-0 flex-col gap-1.5 md:w-[230px]">
            {breakdown.map((b) => (
              <li key={b.name} className="flex items-center gap-2 text-[12px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: b.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground" title={b.name}>{b.name}</span>
                <span className="tabular shrink-0 text-[11px] text-muted-foreground">{won(b.value)}</span>
                <span className="tabular w-[46px] shrink-0 text-right font-medium text-foreground">{b.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </ChartCard>

      <ChartCard title="재료비 %" subtitle="원가율 = 재료비 ÷ 매출 · 카페 벤치마크 25~37%">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={costData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={AXIS} width={44} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => `${v}%`} />} />
            <ReferenceLine y={37} stroke={REF} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="재료비율" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }} connectNulls>
              <LabelList dataKey="재료비율" position="top" offset={8} formatter={pctLabel} style={pointLabel} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <p className="m-0 text-[12px] text-muted-foreground">
        {netVat
          ? '* 매출은 공급가액 기준(부가세 순액, 총액÷1.1·과세 10% 가정). 재료비·판관비는 아직 지급액(VAT 포함)이라 원가율은 다소 높게 보일 수 있어요.'
          : '* 매출은 입금액 기준(부가세 포함).'}{' '}
        자본적지출·보증금·내부이체는 손익에서 제외. 감가상각 미반영(EBIT=EBITDA).
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
      {delta && <div className={`mt-[3px] text-[11px] ${delta.startsWith('▲') ? 'text-positive' : 'text-muted-foreground'}`}>전기 {delta}</div>}
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
