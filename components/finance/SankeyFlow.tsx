'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { REVENUE_COLOR, type SankeyData } from '@/lib/finance/sankey';
import { won } from '@/lib/finance/format';

export interface Period {
  key: string; // 'all' | 'YYYY-MM'
  label: string;
}

const pct = (n: number, total: number) => (total > 0 ? ((n / total) * 100).toFixed(2) : '0.00') + '%';

// ---- 레이아웃 상수 (5열: 유입 · 총유입 · 지출그룹 · 중분류 · 소분류) ----
const VW = 1600; // viewBox 가로
const PAD_Y = 30;
const BAR_W = 15;
const GAP = 5; // 스택 노드 사이 간격
const X_REV = 180;
const X_INC = 400;
const X_GRP = 620;
const X_MID = 880; // 중분류(원두·인건비·임대료 …)
const X_DETAIL = 1150; // 소분류(정규직·단기·일일용역 …)
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
  labelY?: number; // 겹침 회피로 아래로 밀린 라벨 y (리더선으로 노드와 연결)
  leader?: boolean; // 라벨이 노드 중심에서 벗어나 리더선이 필요한지
  linkType?: string; // 클릭 시 거래분류로 필터: 'revenue'|'cogs'|'sga'|'non_operating'|'excluded'|'unclassified'
  linkCat?: string; // 특정 세부 계정(대분류명)으로 좁힘
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
  linkType?: string;
  linkCat?: string;
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
  const midCount = groups.reduce((s, g) => s + g.leaves.length, 0);
  const plotH = Math.max(720, midCount * 54);

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
    const link =
      r.name === '미분류 수입'
        ? { linkType: 'unclassified' }
        : r.name === '기타 수입'
        ? {}
        : { linkType: 'revenue', linkCat: r.name };
    const rect: Rect = {
      x: X_REV, y: ry, h, color: REVENUE_COLOR, name: r.name, amount: r.amount, total: totalRevenue,
      labelSide: 'left', labelX: X_REV - 11, col: X_REV, ...link,
    };
    rects.push(rect);
    revRects.push({ ...rect });
    ry += h + GAP;
  }

  // 총 유입 노드(중앙, 전체 높이)
  rects.push({
    x: X_INC, y: incomeTop, h: incomeH, color: REVENUE_COLOR, name: '총 유입', amount: totalRevenue,
    total: totalRevenue, labelSide: 'left', labelX: X_INC - 11, col: X_INC, isIncome: true, showLabel: true,
  });

  // 매출 → 총매출 리본 (총매출 왼쪽 모서리를 매출 비중대로 분할)
  let incLeftY = incomeTop;
  revRects.forEach((rr, i) => {
    const bandH = totalRevenue > 0 ? (rr.amount / totalRevenue) * incomeH : 0;
    ribbons.push({
      key: `rev-${i}`, color: REVENUE_COLOR, linkType: rr.linkType, linkCat: rr.linkCat,
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
  const midGaps = Math.max(0, midCount - 1) * GAP;
  const midScale = rightTotal > 0 ? (plotH - midGaps) / rightTotal : 0;

  let incRightY = incomeTop; // 총매출 오른쪽 모서리 분할(지출+이익 비중)
  let gy = PAD_Y; // 그룹 노드 스택
  let my = PAD_Y; // 중분류 노드 스택(전 그룹 연속)

  rightEntries.forEach((g, gi) => {
    const gH = Math.max(1.5, g.amount * grpScale);
    // 클릭 링크: 영업이익은 링크 없음, 미분류는 'unclassified', 나머지는 type(key)
    const gLink = g.isProfit ? undefined : g.key;
    // 총매출 → 그룹(또는 영업이익)
    const incBandH = rightTotal > 0 ? (g.amount / rightTotal) * incomeH : 0;
    ribbons.push({
      key: `grp-${gi}`, color: g.color, linkType: gLink,
      x0: X_INC + BAR_W, y0t: incRightY, y0b: incRightY + incBandH,
      x1: X_GRP, y1t: gy, y1b: gy + gH,
    });
    incRightY += incBandH;

    rects.push({
      x: X_GRP, y: gy, h: gH, color: g.color, name: g.label, amount: g.amount,
      total: rightTotal, labelSide: 'left', labelX: X_GRP - 11, col: X_GRP, isProfit: g.isProfit,
      linkType: gLink,
    });

    // 그룹 → 중분류(원두·인건비 …). 영업이익은 leaves 없음.
    let gBandY = gy;
    g.leaves.forEach((mid, li) => {
      const midH = Math.max(1.5, mid.amount * midScale);
      const gBandH = g.amount > 0 ? (mid.amount / g.amount) * gH : 0;
      const midCat = mid.name === '기타' || mid.name === '미분류' ? undefined : mid.name;
      ribbons.push({
        key: `mid-${gi}-${li}`, color: g.color, linkType: gLink, linkCat: midCat,
        x0: X_GRP + BAR_W, y0t: gBandY, y0b: gBandY + gBandH,
        x1: X_MID, y1t: my, y1b: my + midH,
      });
      gBandY += gBandH;

      const kids = mid.children ?? [];
      const hasKids = kids.length > 0;
      rects.push({
        x: X_MID, y: my, h: midH, color: g.color, name: mid.name, amount: mid.amount,
        total: rightTotal, col: X_MID, linkType: gLink, linkCat: midCat,
        // 소분류가 있으면(오른쪽에 5열) 라벨은 왼쪽, 없으면 오른쪽(끝단이라 여백 있음)
        labelSide: hasKids ? 'left' : 'right',
        labelX: hasKids ? X_MID - 11 : X_MID + BAR_W + 11,
      });

      // 중분류 → 소분류(정규직·단기 …): 중분류 높이를 소분류 비중대로 나눠 수평 리본
      if (hasKids) {
        let dY = my;
        kids.forEach((det, di) => {
          const bandH = mid.amount > 0 ? (det.amount / mid.amount) * midH : 0;
          const detH = Math.max(1.5, bandH - 2); // 소분류 사이 얇은 간격
          const detCat = det.name === '기타' ? undefined : det.name;
          ribbons.push({
            key: `det-${gi}-${li}-${di}`, color: g.color, linkType: gLink, linkCat: detCat,
            x0: X_MID + BAR_W, y0t: dY, y0b: dY + bandH,
            x1: X_DETAIL, y1t: dY, y1b: dY + detH,
          });
          rects.push({
            x: X_DETAIL, y: dY, h: detH, color: g.color, name: det.name, amount: det.amount,
            total: rightTotal, labelSide: 'right', labelX: X_DETAIL + BAR_W + 11, col: X_DETAIL,
            linkType: gLink, linkCat: detCat,
          });
          dY += bandH;
        });
      }
      my += midH + GAP;
    });

    gy += gH + GAP;
  });

  // 라벨 겹침 회피: (열, 라벨방향)별로 위→아래 훑으며 겹치면 아래로 밀고 리더선으로 연결.
  // 작은 노드도 숨기지 않고 옆으로 빼서 전부 식별 가능하게.
  const labelGroups: [number, 'left' | 'right'][] = [
    [X_REV, 'left'], [X_GRP, 'left'], [X_MID, 'left'], [X_MID, 'right'], [X_DETAIL, 'right'],
  ];
  const LABEL_H = 30; // 2줄 라벨 최소 세로 간격
  for (const [colX, side] of labelGroups) {
    let lastBottom = -Infinity;
    for (const n of rects.filter((r) => r.col === colX && r.labelSide === side).sort((a, b) => a.y - b.y)) {
      const cy = n.y + n.h / 2;
      const ly = Math.max(cy, lastBottom + LABEL_H);
      n.labelY = ly;
      n.showLabel = true;
      n.leader = ly - cy > 3;
      lastBottom = ly;
    }
  }

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
  const router = useRouter();
  const [key, setKey] = useState(initialKey);
  const [hover, setHover] = useState<string | null>(null);
  const d = data[key];
  const { rects, ribbons, height, balanced } = useMemo(() => layout(d), [d]);

  const hasData = d.totalRevenue > 0 || d.totalExpense > 0;

  const ebit = d.totalRevenue - d.totalExpense;

  // 노드 클릭 → 지출 자료 분류 화면을 해당 거래만 필터링해 연다
  const hrefFor = (n: Rect): string | null => {
    if (!n.linkType) return null;
    const p = new URLSearchParams();
    if (key !== 'all') p.set('ym', key);
    if (n.linkType === 'unclassified') p.set('unclassified', '1');
    else {
      p.set('type', n.linkType);
      if (n.linkCat) p.set('cat', n.linkCat);
    }
    return `/finance/classify?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 요약 카드 */}
      <div className="flex flex-wrap items-center gap-3">
        <Card label="총 유입" value={won(d.totalRevenue)} color="hsl(var(--number-colored))" />
        <Card label="총 유출" value={won(d.totalExpense)} color="hsl(var(--foreground))" />
        <Card label="영업이익(순증감)" value={won(ebit)} color={ebit >= 0 ? 'hsl(var(--number-colored))' : 'hsl(var(--destructive))'} />
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
          <p className="m-0 text-[13px]">이 기간에는 분류된 거래가 없어요.</p>
        </div>
      ) : (
        <div className="overflow-x-auto py-1">
          <svg viewBox={`0 0 ${VW} ${height}`} width="100%" style={{ minWidth: 720, display: 'block' }}>
            {/* 리본 */}
            {ribbons.map((r) => {
              const dim = hover !== null && hover !== r.key && !hover.startsWith('node');
              const rhref = r.linkType
                ? (() => {
                    const p = new URLSearchParams();
                    if (key !== 'all') p.set('ym', key);
                    if (r.linkType === 'unclassified') p.set('unclassified', '1');
                    else {
                      p.set('type', r.linkType);
                      if (r.linkCat) p.set('cat', r.linkCat);
                    }
                    return `/finance/classify?${p.toString()}`;
                  })()
                : null;
              return (
                <path
                  key={r.key}
                  d={ribbonPath(r)}
                  fill={r.color}
                  fillOpacity={hover === r.key ? 0.6 : dim ? 0.14 : 0.4}
                  onMouseEnter={() => setHover(r.key)}
                  onMouseLeave={() => setHover(null)}
                  onClick={rhref ? () => router.push(rhref) : undefined}
                  style={{ transition: 'fill-opacity .12s', cursor: rhref ? 'pointer' : 'default' }}
                />
              );
            })}
            {/* 노드 바 + 라벨 */}
            {rects.map((n, i) => {
              // 총 매출 라벨은 노드 상단에(리본 위 중앙 겹침 방지)
              const ly = n.isIncome ? PAD_Y + 6 : n.labelY ?? n.y + n.h / 2;
              const baseline = n.isIncome ? 'hanging' : 'middle';
              const href = hrefFor(n);
              const cy = n.y + n.h / 2;
              return (
                <g
                  key={i}
                  onClick={href ? () => router.push(href) : undefined}
                  style={{ cursor: href ? 'pointer' : 'default' }}
                >
                  {/* 리더선: 작은 노드의 라벨을 아래로 빼서 연결 */}
                  {n.leader && !n.isIncome && (
                    <polyline
                      points={
                        n.labelSide === 'left'
                          ? `${n.x},${cy} ${n.x - 6},${cy} ${n.labelX + 3},${ly}`
                          : `${n.x + BAR_W},${cy} ${n.x + BAR_W + 6},${cy} ${n.labelX - 3},${ly}`
                      }
                      fill="none"
                      stroke="hsl(var(--muted-foreground))"
                      strokeOpacity={0.45}
                      strokeWidth={1}
                    />
                  )}
                  <rect x={n.x} y={n.y} width={BAR_W} height={n.h} rx={3} fill={n.color} />
                  {n.showLabel && (
                    <text
                      x={n.labelX}
                      y={ly}
                      textAnchor={n.labelSide === 'left' ? 'end' : 'start'}
                      dominantBaseline={baseline}
                      style={{ cursor: href ? 'pointer' : 'default' }}
                    >
                      <tspan x={n.labelX} dy={n.isIncome ? '0' : '-0.35em'} fontSize={12.5} fill="hsl(var(--foreground))">
                        {n.name}
                      </tspan>
                      <tspan x={n.labelX} dy="1.25em" fontSize={11} fill="hsl(var(--muted-foreground))">
                        {won(n.amount)} ({pct(n.amount, n.total)})
                      </tspan>
                    </text>
                  )}
                  <title>{`${n.name} · ${won(n.amount)} (${pct(n.amount, n.total)})${href ? ' · 클릭해서 지출 자료 분류로' : ''}`}</title>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <p className="m-0 text-[11px] leading-[1.6] text-muted-foreground">
        {balanced
          ? '통장의 모든 입금·출금을 반영해요(미분류 포함) — 총 유입 = 지출 그룹들 + 영업이익(초록), 오른쪽 전체가 총 유입의 100%. 영업이익은 통장 현황의 순증감과 일치해요. 아직 분류 안 된 건 회색 ‘미분류’로 보여요.'
          : '이 기간은 순유출이 더 커요(적자). 오른쪽은 총 유출 대비 비율이고, 미분류도 포함돼요. 영업이익(순증감)은 카드로 표시.'}
      </p>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="ta-card min-w-[150px] p-[14px_18px]">
      <div className="mb-1.5 text-[11px] tracking-[0.02em] text-muted-foreground">{label}</div>
      <div className="tabular text-[22px] font-extrabold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
