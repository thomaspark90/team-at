'use client';

import { useMemo, useState } from 'react';
import { REVENUE_COLOR, type SankeyData } from '@/lib/finance/sankey';

export interface Period {
  key: string; // 'all' | 'YYYY-MM'
  label: string;
}

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const pct = (n: number, total: number) => (total > 0 ? ((n / total) * 100).toFixed(2) : '0.00') + '%';

// ---- 레이아웃 상수 ----
const VW = 1360; // viewBox 가로
const PAD_Y = 30;
const BAR_W = 15;
const GAP = 5; // 스택 노드 사이 간격
const X_REV = 210;
const X_INC = 455;
const X_GRP = 705;
const X_LEAF = 940;
const MIN_SEP = 22; // 같은 열에서 라벨을 표시할 최소 세로 간격

interface Rect {
  x: number;
  y: number;
  h: number;
  color: string;
  name: string;
  amount: number;
  total: number;
  labelSide: 'left' | 'right';
  labelX: number;
  col: number; // 라벨 겹침 억제용 열 구분(x 좌표)
  isIncome?: boolean;
  isProfit?: boolean;
  showLabel?: boolean;
}
interface Ribbon {
  key: string;
  x0: number;
  y0t: number;
  y0b: number;
  x1: number;
  y1t: number;
  y1b: number;
  color: string;
}

function ribbonPath(r: Ribbon): string {
  const xc = (r.x0 + r.x1) / 2;
  return `M${r.x0},${r.y0t} C${xc},${r.y0t} ${xc},${r.y1t} ${r.x1},${r.y1t} L${r.x1},${r.y1b} C${xc},${r.y1b} ${xc},${r.y0b} ${r.x0},${r.y0b} Z`;
}

function layout(d: SankeyData) {
  const { revenue, totalRevenue, groups, totalExpense } = d;
  const surplus = totalRevenue - totalExpense; // 영업이익(근사)
  const balanced = surplus > 0; // 흑자면 총매출 기준으로 영업이익 가지를 흐름에 표시
  const rightTotal = balanced ? totalRevenue : totalExpense;
  const leafCount = groups.reduce((s, g) => s + g.leaves.length, 0);
  const plotH = Math.max(560, leafCount * 40);

  const rects: Rect[] = [];
  const ribbons: Ribbon[] = [];
  const incomeTop = PAD_Y;
  const incomeH = plotH;

  // ---- 왼쪽: 매출 노드 ----
  const revGaps = Math.max(0, revenue.length - 1) * GAP;
  const revScale = totalRevenue > 0 ? (plotH - revGaps) / totalRevenue : 0;
  let ry = PAD_Y;
  const revRects: (Rect & { amount: number })[] = [];
  for (const r of revenue) {
    const h = Math.max(1.5, r.amount * revScale);
    const rect: Rect = {
      x: X_REV, y: ry, h, color: REVENUE_COLOR, name: r.name, amount: r.amount, total: totalRevenue,
      labelSide: 'left', labelX: X_REV - 11, col: X_REV,
    };
    rects.push(rect);
    revRects.push({ ...rect });
    ry += h + GAP;
  }

  // 총 매출 노드(중앙, 전체 높이)
  rects.push({
    x: X_INC, y: incomeTop, h: incomeH, color: REVENUE_COLOR, name: '총 매출', amount: totalRevenue,
    total: totalRevenue, labelSide: 'left', labelX: X_INC - 11, col: X_INC, isIncome: true, showLabel: true,
  });

  // 매출 → 총매출 리본 (총매출 왼쪽 모서리를 매출 비중대로 분할)
  let incLeftY = incomeTop;
  revRects.forEach((rr, i) => {
    const bandH = totalRevenue > 0 ? (rr.amount / totalRevenue) * incomeH : 0;
    ribbons.push({
      key: `rev-${i}`, color: REVENUE_COLOR,
      x0: X_REV + BAR_W, y0t: rr.y, y0b: rr.y + rr.h,
      x1: X_INC, y1t: incLeftY, y1b: incLeftY + bandH,
    });
    incLeftY += bandH;
  });

  // ---- 오른쪽: 지출 그룹(+ 흑자면 영업이익) + 세부 ----
  // 흑자면 총매출 기준으로 분배해 '총매출 = 지출 + 영업이익' 을 흐름으로 보여준다.
  const rightEntries = groups.map((g) => ({ ...g, isProfit: false }));
  if (balanced) {
    rightEntries.push({ key: '__profit', label: '영업이익', color: REVENUE_COLOR, amount: surplus, leaves: [], isProfit: true });
  }
  const grpGaps = Math.max(0, rightEntries.length - 1) * GAP;
  const grpScale = rightTotal > 0 ? (plotH - grpGaps) / rightTotal : 0;
  const leafGaps = Math.max(0, leafCount - 1) * GAP;
  const leafScale = rightTotal > 0 ? (plotH - leafGaps) / rightTotal : 0;

  let incRightY = incomeTop; // 총매출 오른쪽 모서리 분할(지출+이익 비중)
  let gy = PAD_Y; // 그룹 노드 스택
  let ly = PAD_Y; // 세부 노드 스택(전 그룹 연속)

  rightEntries.forEach((g, gi) => {
    const gH = Math.max(1.5, g.amount * grpScale);
    // 총매출 → 그룹(또는 영업이익)
    const incBandH = rightTotal > 0 ? (g.amount / rightTotal) * incomeH : 0;
    ribbons.push({
      key: `grp-${gi}`, color: g.color,
      x0: X_INC + BAR_W, y0t: incRightY, y0b: incRightY + incBandH,
      x1: X_GRP, y1t: gy, y1b: gy + gH,
    });
    incRightY += incBandH;

    rects.push({
      x: X_GRP, y: gy, h: gH, color: g.color, name: g.label, amount: g.amount,
      total: rightTotal, labelSide: 'left', labelX: X_GRP - 11, col: X_GRP, isProfit: g.isProfit,
    });

    // 그룹 → 세부: 그룹 오른쪽 모서리를 세부 비중대로 분할(영업이익은 세부 없음)
    let gBandY = gy;
    g.leaves.forEach((lf, li) => {
      const lH = Math.max(1.5, lf.amount * leafScale);
      const gBandH = g.amount > 0 ? (lf.amount / g.amount) * gH : 0;
      ribbons.push({
        key: `leaf-${gi}-${li}`, color: g.color,
        x0: X_GRP + BAR_W, y0t: gBandY, y0b: gBandY + gBandH,
        x1: X_LEAF, y1t: ly, y1b: ly + lH,
      });
      gBandY += gBandH;

      rects.push({
        x: X_LEAF, y: ly, h: lH, color: g.color, name: lf.name, amount: lf.amount,
        total: rightTotal, labelSide: 'right', labelX: X_LEAF + BAR_W + 11, col: X_LEAF,
      });
      ly += lH + GAP;
    });

    gy += gH + GAP;
  });

  // 라벨 겹침 억제: 같은 열에서 위→아래로 훑으며 최소 간격을 못 채우면 라벨 생략
  // (총 매출은 항상 표시). 작은 인접 노드는 라벨을 숨겨 Monarch 처럼 깔끔하게.
  for (const colX of [X_REV, X_GRP, X_LEAF]) {
    let lastBottom = -Infinity;
    for (const n of rects.filter((r) => r.col === colX).sort((a, b) => a.y - b.y)) {
      const cy = n.y + n.h / 2;
      if (cy - MIN_SEP / 2 >= lastBottom) {
        n.showLabel = true;
        lastBottom = cy + MIN_SEP / 2;
      } else {
        n.showLabel = false;
      }
    }
  }

  rects.forEach((n) => {
    if (n.isProfit) n.showLabel = true; // 영업이익 라벨은 항상 표시
  });

  const height = plotH + PAD_Y * 2;
  return { rects, ribbons, height, balanced };
}

export default function SankeyFlow({
  periods,
  data,
  initialKey,
}: {
  periods: Period[];
  data: Record<string, SankeyData>;
  initialKey: string;
}) {
  const [key, setKey] = useState(initialKey);
  const [hover, setHover] = useState<string | null>(null);
  const d = data[key];
  const { rects, ribbons, height, balanced } = useMemo(() => layout(d), [d]);

  const hasData = d.totalRevenue > 0 || d.totalExpense > 0;

  const ebit = d.totalRevenue - d.totalExpense;

  return (
    <div className="flex flex-col gap-4">
      {/* 요약 카드 */}
      <div className="flex flex-wrap items-center gap-3">
        <Card label="총 매출" value={won(d.totalRevenue)} color="hsl(var(--number-colored))" />
        <Card label="총 지출" value={won(d.totalExpense)} color="hsl(var(--foreground))" />
        <Card label="영업이익(EBIT 근사)" value={won(ebit)} color={ebit >= 0 ? 'hsl(var(--number-colored))' : 'hsl(var(--destructive))'} />
        <div className="flex-1" />
        <select
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="ta-input self-center"
        >
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {!hasData ? (
        <div className="mx-auto my-[60px] text-center text-muted-foreground">
          <div className="mb-2.5 text-[32px]">📭</div>
          <p className="m-0 text-[14px]">이 기간에는 분류된 거래가 없어요.</p>
        </div>
      ) : (
        <div className="overflow-x-auto py-1">
          <svg viewBox={`0 0 ${VW} ${height}`} width="100%" style={{ minWidth: 720, display: 'block' }}>
            {/* 리본 */}
            {ribbons.map((r) => {
              const dim = hover !== null && hover !== r.key && !hover.startsWith('node');
              return (
                <path
                  key={r.key}
                  d={ribbonPath(r)}
                  fill={r.color}
                  fillOpacity={hover === r.key ? 0.6 : dim ? 0.14 : 0.4}
                  onMouseEnter={() => setHover(r.key)}
                  onMouseLeave={() => setHover(null)}
                  style={{ transition: 'fill-opacity .12s' }}
                />
              );
            })}
            {/* 노드 바 + 라벨 */}
            {rects.map((n, i) => {
              // 총 매출 라벨은 노드 상단에(리본 위 중앙 겹침 방지)
              const ly = n.isIncome ? PAD_Y + 6 : n.y + n.h / 2;
              const baseline = n.isIncome ? 'hanging' : 'middle';
              return (
                <g key={i}>
                  <rect x={n.x} y={n.y} width={BAR_W} height={n.h} rx={3} fill={n.color} />
                  {n.showLabel && (
                    <text
                      x={n.labelX}
                      y={ly}
                      textAnchor={n.labelSide === 'left' ? 'end' : 'start'}
                      dominantBaseline={baseline}
                    >
                      <tspan x={n.labelX} dy={n.isIncome ? '0' : '-0.35em'} fontSize={12.5} fill="hsl(var(--foreground))">
                        {n.name}
                      </tspan>
                      <tspan x={n.labelX} dy="1.25em" fontSize={11} fill="hsl(var(--muted-foreground))">
                        {won(n.amount)} ({pct(n.amount, n.total)})
                      </tspan>
                    </text>
                  )}
                  <title>{`${n.name} · ${won(n.amount)} (${pct(n.amount, n.total)})`}</title>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <p className="m-0 text-[12px] leading-[1.6] text-muted-foreground">
        {balanced
          ? '총 매출이 지출 그룹들과 영업이익(초록)으로 갈라져요 — 오른쪽 전체가 총 매출의 100%예요. 분류된 거래만 집계하며, 소분류는 대분류(예: 정규직→인건비)로 묶여요.'
          : '이 기간은 적자라 영업이익 가지는 생략했어요(카드로 표시). 오른쪽은 총 지출 대비 비율이에요.'}
      </p>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="ta-card min-w-[150px] p-[14px_18px]">
      <div className="mb-1.5 text-[11px] tracking-[0.02em] text-muted-foreground">{label}</div>
      <div className="tabular text-[20px] font-extrabold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
