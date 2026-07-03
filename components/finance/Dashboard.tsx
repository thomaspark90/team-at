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

const REV = '#12805c';
const EBIT = '#0099FF';
const NET = '#b7791f';
const EXP = '#b23b3b';
const COLORS = ['#0099FF', '#12805c', '#b23b3b', '#b7791f', '#6b5b95', '#e07a5f', '#3d9970', '#f39c12', '#8e44ad', '#16a085', '#c0392b', '#2c3e50', '#d35400', '#7f8c8d'];

export default function Dashboard({ txns, cats }: { txns: AggTx[]; cats: AggCat[] }) {
  const [unit, setUnit] = useState<Unit>('month');
  const { months, expenseKeys } = useMemo(() => aggregate(txns, cats, unit), [txns, cats, unit]);

  const fmtP = (key: string) => (unit === 'month' ? key.slice(2).replace('-', '.') : key.slice(5).replace('-', '/'));

  const toggle = (
    <div style={{ display: 'flex', gap: 6 }}>
      {(['month', 'week'] as Unit[]).map((u) => {
        const on = unit === u;
        return (
          <button
            key={u}
            onClick={() => setUnit(u)}
            style={{
              fontSize: 13, padding: '7px 16px', borderRadius: 8,
              border: `1px solid ${on ? EBIT : '#DDD'}`,
              background: on ? EBIT : '#fff', color: on ? '#fff' : '#555',
              fontWeight: on ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {u === 'month' ? '월 단위' : '주 단위 (W)'}
          </button>
        );
      })}
    </div>
  );

  if (months.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {toggle}
        <div style={{ margin: '40px auto', maxWidth: 460, textAlign: 'center', color: '#777' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>표시할 데이터가 없어요</h2>
          <p style={{ fontSize: 14, margin: 0 }}>거래를 분류하면 매출·지출·손익 그래프가 여기 그려져요.</p>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Stat label={`${unitLabel} 매출`} value={won(last.revenue)} accent={REV} delta={delta(last.revenue, prev?.revenue)} />
          <Stat label="지출(원가+판관비)" value={won(lastExpense)} accent={EXP} delta={delta(lastExpense, prevExpense)} />
          <Stat label="영업이익(EBIT)" value={won(last.ebit)} accent={EBIT} delta={delta(last.ebit, prev?.ebit)} />
          <Stat label="당기순이익" value={won(last.net)} accent={NET} delta={delta(last.net, prev?.net)} />
        </div>
        {toggle}
      </div>

      <ChartCard title="매출 추이" subtitle="점선=평균">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
            <XAxis dataKey="p" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={manwon} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => won(Number(v))} />
            <ReferenceLine y={avgRev} stroke="#BBB" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="매출" stroke={REV} strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="영업이익 추이" subtitle="EBIT · 당기순이익">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
            <XAxis dataKey="p" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={manwon} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => won(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#CCC" />
            <Line type="monotone" dataKey="EBIT" stroke={EBIT} strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="순이익" stroke={NET} strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="손익 추이 %" subtitle="영업이익률 = EBIT ÷ 매출">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={ratioData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
            <XAxis dataKey="p" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={44} />
            <Tooltip formatter={(v) => `${v}%`} />
            <ReferenceLine y={0} stroke="#CCC" />
            <Line type="monotone" dataKey="손익률" stroke={EBIT} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="지출 구분" subtitle="카테고리별 지출(누적)">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
            <XAxis dataKey="p" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={manwon} tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => won(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {expenseKeys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="a" fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="재료비 %" subtitle="원가율 = 재료비 ÷ 매출 · 카페 벤치마크 25~37%">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={costData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
            <XAxis dataKey="p" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={44} />
            <Tooltip formatter={(v) => `${v}%`} />
            <ReferenceLine y={37} stroke="#E0B4B4" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="재료비율" stroke={EXP} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>
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

function Stat({ label, value, accent, delta }: { label: string; value: string; accent: string; delta: string | null }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, padding: '14px 18px', minWidth: 150, flex: '1 1 auto' }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {delta && <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>전기 {delta}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, padding: '18px 16px 12px' }}>
      <div style={{ padding: '0 6px 12px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
