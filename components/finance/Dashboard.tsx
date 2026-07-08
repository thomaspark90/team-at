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
import { aggregate, capexDepreciation, UNCLASSIFIED, type AggTx, type AggCat, type Unit } from '@/lib/finance/aggregate';
import { wonNum as won } from '@/lib/finance/format';

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

function ChartTooltip({ active, payload, label, fmt, share }: any) {
  if (!active || !payload?.length) return null;
  const total = share ? payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0) : 0;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] shadow-none">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 tabular text-foreground">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {share && <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color || p.fill }} aria-hidden />}
            {p.name}
          </span>
          <span className="flex items-baseline gap-2">
            <span>{fmt ? fmt(p.value) : p.value}</span>
            {share && total > 0 && (
              <span className="w-[42px] text-right text-muted-foreground">{((Number(p.value) / total) * 100).toFixed(1)}%</span>
            )}
          </span>
        </div>
      ))}
      {share && total > 0 && (
        <div className="mt-1 flex justify-between gap-3 border-t border-border pt-1 tabular font-medium text-foreground">
          <span className="text-muted-foreground">합계</span>
          <span>{fmt ? fmt(total) : total}</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({
  txns,
  cats,
  posSales = [],
}: {
  txns: AggTx[];
  cats: AggCat[];
  posSales?: { saleDate: string; supply: number }[];
}) {
  const [unit, setUnit] = useState<Unit>('month');
  const [netVat, setNetVat] = useState(true);
  const { months, expenseKeys } = useMemo(
    () => aggregate(txns, cats, unit, netVat, posSales),
    [txns, cats, unit, netVat, posSales],
  );

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
          <h2 className="mb-2 text-[15px] text-foreground">표시할 데이터가 없어요</h2>
          <p className="text-[13px]">거래를 분류하면 매출·지출·손익 그래프가 여기 그려져요.</p>
        </div>
      </div>
    );
  }

  const last = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;
  const avgRev = months.reduce((a, m) => a + m.revenue, 0) / months.length;

  const lineData = months.map((m) => ({ p: fmtP(m.ym), 매출: m.revenue, EBIT: m.ebit, 순이익: m.net }));
  // 감가상각(자본적지출 5년 정액) 반영 영업이익 — 비교용
  const dep = capexDepreciation(txns, cats);
  const hasCapex = Object.keys(dep).length > 0;
  const depData = months.map((m) => ({ p: fmtP(m.ym), 영업이익: m.ebit, '감가상각 반영': m.ebit - (dep[m.ym] ?? 0) }));
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
  const colorOf = (k: string, i: number) => (k === '기타' || k === UNCLASSIFIED ? CAT_OTHER : CAT[i]);
  const barData = months.map((m) => {
    const row: Record<string, number | string> = { p: fmtP(m.ym), 총지출: m.cogs + m.sga };
    for (const k of topKeys) row[k] = m.expense[k] || 0;
    if (hasOther) row['기타'] = otherKeys.reduce((s, k) => s + (m.expense[k] || 0), 0);
    return row;
  });
  // 항목별 비중 — 최근(가장 최신) 달 기준 구성비. 색은 전체기간 순위로 고정(엔티티→색), 리스트는 그 달 값으로 정렬.
  const lastValueOf = (k: string) =>
    k === '기타' ? otherKeys.reduce((s, kk) => s + (last.expense[kk] || 0), 0) : last.expense[k] || 0;
  const lastExpenseTotal = last.cogs + last.sga;
  const breakdown = barKeys
    .map((k, i) => {
      const value = lastValueOf(k);
      return { name: k, value, pct: lastExpenseTotal > 0 ? (value / lastExpenseTotal) * 100 : 0, color: colorOf(k, i) };
    })
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value);
  const breakdownLabel = unit === 'month' ? `${+last.ym.slice(5, 7)}월` : `${+last.ym.slice(5, 7)}/${+last.ym.slice(8, 10)} 주`;

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
      {months.length > 0 && last.revenue === 0 && (
        <div className="-mt-2 text-[11px] text-muted-foreground">
          이 기간 <b>POS 매출이 없어요</b> — 매출은 <a href="/finance/pnl" className="underline">관리손익</a>에서 토스 매출리포트를 올려야 잡혀요.
        </div>
      )}

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

      {unit === 'month' && hasCapex && (
        <ChartCard title="감가상각 반영 영업이익" subtitle="자본적지출을 5년 정액 상각해 뺀 실질 영업이익 · 위 EBIT와 비교">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={depData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
              <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
              <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
              <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
              <ReferenceLine y={0} stroke={REF} />
              <Line type="monotone" dataKey="영업이익" stroke={LINE2} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2, fill: LINE2 }} />
              <Line type="monotone" dataKey="감가상각 반영" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }}>
                <LabelList dataKey="감가상각 반영" position="top" offset={8} formatter={wonLabel} style={pointLabel} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

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

      <ChartCard title="지출 구분" subtitle={`월별 카테고리 지출(누적) · 오른쪽은 ${breakdownLabel} 구성비`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
                <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
                <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} share />} />
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
          <div className="w-full shrink-0 md:w-[230px]">
            <ul className="flex flex-col gap-1.5">
              {breakdown.map((b) => (
                <li key={b.name} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: b.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-foreground" title={b.name}>{b.name}</span>
                  <span className="tabular shrink-0 text-[11px] text-muted-foreground">{won(b.value)}</span>
                  <span className="tabular w-[46px] shrink-0 text-right font-medium text-foreground">{b.pct.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
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

      <p className="m-0 text-[11px] text-muted-foreground">
        {netVat
          ? '* 부가세 순액(공급가액) 기준 — 매출과 과세 매입(재료비·과세 판관비)을 총액÷1.1로 순액 처리. 인건비·이자·수도·세금 등 면세 항목은 그대로. 과세 여부는 계정과목 관리에서 조정.'
          : '* 매출·비용 모두 통장 금액(부가세 포함) 그대로.'}{' '}
        미분류 거래도 손익에 반영해요(수입→매출, 지출→&lsquo;미분류&rsquo; 비용) — 분류하면 정확한 계정으로 옮겨가요.
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
      <div className="tabular text-[22px] text-foreground">{value}</div>
      {delta && <div className={`mt-[3px] text-[11px] ${delta.startsWith('▲') ? 'text-positive' : 'text-muted-foreground'}`}>전기 {delta}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="ta-card p-[18px_16px_12px]">
      <div className="px-1.5 pb-3">
        <h3 className="m-0 text-[15px] text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
