'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
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
import { useMonthCtx } from './MonthShell';

const manwon = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000).toLocaleString()}만` : String(v));

// 회계 자료 화면과 같은 '단위'(브랜드+지점) 칩 — 하나로 브랜드·지점을 함께 고른다.
// '전체'=사업 브랜드 합산(개인 제외), '가든서비스'=두 지점+미지정, 그 아래가 지점별.
type SegId = 'all' | 'staffmeal' | 'garden' | 'garden-yangjae' | 'garden-pangyo';
const SEGMENTS: { id: SegId; label: string; brand: 'all' | 'garden' | 'staffmeal'; store: 'all' | 'pangyo' | 'yangjae' }[] = [
  { id: 'all', label: '전체', brand: 'all', store: 'all' },
  { id: 'staffmeal', label: '스탭밀', brand: 'staffmeal', store: 'all' },
  { id: 'garden', label: '가든서비스', brand: 'garden', store: 'all' },
  { id: 'garden-yangjae', label: '가든(양재천)', brand: 'garden', store: 'yangjae' },
  { id: 'garden-pangyo', label: '가든(판교)', brand: 'garden', store: 'pangyo' },
];

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

// 지표 페이지 차트 순서 — 헤더 그립을 드래그해서 바꾸면 이 브라우저에 저장(계정과 무관)
const DEFAULT_CHART_ORDER = ['bank', 'revenue', 'ebit', 'capex', 'ratio', 'expense', 'cost', 'menu'] as const;
type ChartId = (typeof DEFAULT_CHART_ORDER)[number];
const CHART_ORDER_KEY = 'finance-metrics-chart-order-v1';

const axisTick = { fontSize: 11, fill: AXIS };
// x축 각 지점마다 상시 노출하는 값 라벨 스타일
const pointLabel = { fontSize: 11, fill: AXIS };
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

// 상품명에서 급식 티어(Newbie/Staff/Boss)와 매장/포장 여부를 뽑아낸다. 표기가 파일마다 들쭉날쭉해서
// (영문·한글, 괄호·슬래시, 공백 유무) 정규식으로 느슨하게 매칭한다. '포장' 표기가 없는 배달앱 주문은
// 매장 취식이 아니므로 포장으로 묶는다(2026-08-19 대표 요청 — 매장/포장만 필요).
const MENU_TIERS = ['Staff', 'Newbie', 'Boss'] as const;
type MenuTier = (typeof MENU_TIERS)[number];
const MENU_TIER_PATTERN: Record<MenuTier, RegExp> = {
  Staff: /staff|스태프|스탭/i,
  Newbie: /newbie|뉴비/i,
  Boss: /boss|보스/i,
};
function tierOf(product: string): MenuTier | null {
  for (const t of MENU_TIERS) if (MENU_TIER_PATTERN[t].test(product)) return t;
  return null;
}
function channelOf(product: string): '매장' | '포장' {
  return /포장/.test(product) ? '포장' : '매장';
}

export default function Dashboard({
  txns,
  cats,
  posSales = [],
  bankCash = [],
  menuItems = [],
  reportUnit,
}: {
  txns: AggTx[];
  cats: AggCat[];
  posSales?: { saleDate: string; supply: number; brand?: string | null; store?: string | null }[];
  // 통장 입출금·월말 잔액 월별 집계(서버 프리페치) — 첫 차트용. viewer는 빈 배열 → 차트 생략
  bankCash?: { ym: string; brand: string; bank: string; inflow: number; outflow: number; balance: number }[];
  // 스탭밀 상품별 판매량(finance.pos_items) — 메뉴 판매량 추이 차트 전용
  menuItems?: { saleDate: string; category: string; product: string; qty: number }[];
  // 상단 매장 필(FinanceNav ?unit=)이 정하는 브랜드+지점 — 이 화면 자체 토글은 없앴다(2026-08-19).
  reportUnit: { brand: 'staffmeal' | 'garden'; store: 'pangyo' | 'yangjae' | null };
}) {
  const [unit, setUnit] = useState<Unit>('month');
  const [netVat, setNetVat] = useState(true);
  // 브랜드+지점은 상단 매장 필에서만 바뀐다 — 페이지가 서버에서 다시 그려지며 이 prop이 갱신된다.
  const segId: SegId =
    reportUnit.brand === 'staffmeal' ? 'staffmeal' : reportUnit.store === 'yangjae' ? 'garden-yangjae' : reportUnit.store === 'pangyo' ? 'garden-pangyo' : 'garden';
  const seg = SEGMENTS.find((s) => s.id === segId) ?? SEGMENTS[0];
  const { brand, store } = seg;
  // 좌측 연·월 사이드바(MonthShell)와 동기 — 고른 달의 요약 타일·구성비를 비춘다. 셸 밖(구 화면)이면 null → 최근 달.
  const ctx = useMonthCtx();

  // 차트 순서 — 헤더 그립을 드래그해서 바꾸고 이 브라우저에 저장(계정과 무관, localStorage)
  const [order, setOrder] = useState<ChartId[]>([...DEFAULT_CHART_ORDER]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHART_ORDER_KEY) ?? 'null') as ChartId[] | null;
      if (!saved) return;
      const known = saved.filter((id) => (DEFAULT_CHART_ORDER as readonly string[]).includes(id));
      const missing = DEFAULT_CHART_ORDER.filter((id) => !known.includes(id));
      setOrder([...known, ...missing]);
    } catch {
      /* localStorage 접근 불가(프라이빗 모드 등) — 기본 순서로 진행 */
    }
  }, []);
  const reorderChart = (draggedId: string, targetId: string) => {
    if (draggedId === targetId || !(DEFAULT_CHART_ORDER as readonly string[]).includes(draggedId)) return;
    setOrder((prev) => {
      if (!prev.includes(targetId as ChartId)) return prev;
      const next = prev.filter((x) => x !== draggedId);
      next.splice(next.indexOf(targetId as ChartId), 0, draggedId as ChartId);
      try {
        localStorage.setItem(CHART_ORDER_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패는 무시 — 이번 세션 순서만 적용 */
      }
      return next;
    });
  };

  // 통장 입출금·잔액 월별 시계열 — 브랜드 필터만 적용(통장은 브랜드 단위, 가든 지점 구분 없음).
  // 선두의 전부-0 달은 잘라 실데이터 시작부터 그린다.
  const bankData = useMemo(() => {
    const rows =
      brand === 'all'
        ? bankCash.filter((r) => r.brand !== 'personal')
        : bankCash.filter((r) => (r.brand || 'garden') === brand);
    const byYm = new Map<string, { in: number; out: number; bal: number }>();
    for (const r of rows) {
      const a = byYm.get(r.ym) ?? { in: 0, out: 0, bal: 0 };
      a.in += r.inflow;
      a.out += r.outflow;
      a.bal += r.balance;
      byYm.set(r.ym, a);
    }
    const all = Array.from(byYm.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, a]) => ({ p: ym.slice(2).replace('-', '.'), 입금: a.in, 출금: a.out, '월말 잔액': a.bal }));
    const first = all.findIndex((d) => d.입금 !== 0 || d.출금 !== 0 || d['월말 잔액'] !== 0);
    return first < 0 ? [] : all.slice(first);
  }, [bankCash, brand]);
  const { months, expenseKeys } = useMemo(() => {
    // '전체'는 사업 브랜드만 — 개인(personal)은 손익 제외라 카테고리와 무관하게 뺀다.
    let tx = brand === 'all' ? txns.filter((t) => t.brand !== 'personal') : txns.filter((t) => (t.brand ?? 'garden') === brand);
    let pos = brand === 'all' ? posSales : posSales.filter((p) => (p.brand ?? 'garden') === brand);
    if (brand === 'garden' && store !== 'all') {
      tx = tx.filter((t) => t.store === store);
      pos = pos.filter((p) => (p.store ?? '') === store);
    }
    return aggregate(tx, cats, unit, netVat, pos);
  }, [txns, cats, unit, netVat, posSales, brand, store]);

  // 메뉴 판매량 추이(Newbie/Staff/Boss × 매장/포장) — 스탭밀 세그먼트에서만, 월 단위로만 그린다
  // (상품별 리포트가 일자별이라 주 단위 집계까지는 필요 없다고 판단).
  const menuQtyData = useMemo(() => {
    if (brand !== 'staffmeal') return [];
    const byMonth = new Map<string, Record<string, number>>();
    for (const it of menuItems) {
      const tier = tierOf(it.product);
      if (!tier) continue;
      const ym = it.saleDate.slice(0, 7);
      const row = byMonth.get(ym) ?? {};
      const key = `${tier}-${channelOf(it.product)}`;
      row[key] = (row[key] ?? 0) + it.qty;
      byMonth.set(ym, row);
    }
    return Array.from(byMonth.keys())
      .sort()
      .map((ym) => ({ p: ym.slice(2).replace('-', '.'), ...byMonth.get(ym) }));
  }, [menuItems, brand]);

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
      <div className="flex flex-col gap-8">
        {toggle}
        <div className="mx-auto my-10 max-w-[460px] text-center text-muted-foreground">
          <div className="mb-3 text-[32px]">📊</div>
          <h2 className="mb-2 text-[15px] text-foreground">표시할 데이터가 없어요</h2>
          <p className="text-[13px]">거래를 분류하면 매출·지출·손익 그래프가 여기 그려져요.</p>
        </div>
      </div>
    );
  }

  // 요약 타일·구성비의 기준 달 = 사이드바에서 고른 달(월 단위). 그 달 데이터가 없거나 주 단위면 가장 최근.
  const focusIdx = (() => {
    if (unit === 'month' && ctx?.ym) {
      const i = months.findIndex((m) => m.ym === ctx.ym);
      if (i >= 0) return i;
    }
    return months.length - 1;
  })();
  const last = months[focusIdx];
  const prev = focusIdx > 0 ? months[focusIdx - 1] : null;
  const avgRev = months.reduce((a, m) => a + m.revenue, 0) / months.length;
  const isPast = focusIdx < months.length - 1; // 최근이 아닌 과거 달을 보는 중
  const focusP = fmtP(last.ym); // 차트에서 선택 달 위치(강조선)

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
  const unitLabel = unit === 'month' ? (isPast ? `${focusP}` : '이번 달') : '이번 주';

  // 차트별 노드 — order 배열 순서대로 렌더링(드래그로 순서 변경). 조건부로 안 그리는 차트는 키 자체를 비움.
  const chartNodes: Partial<Record<ChartId, React.ReactNode>> = {};
  if (unit === 'month' && bankData.length > 0) {
    chartNodes.bank = (
      <ChartCard
        key="bank"
        id="bank"
        onReorder={reorderChart}
        title="통장 입출금·잔액"
        subtitle={`월별 입금·출금(막대)과 월말 잔액(선) · 분류 무관 통장 기준${
          brand === 'garden' && store !== 'all' ? ' · 통장은 가든 공용(지점 구분 없음)' : ''
        }`}
      >
        <ResponsiveContainer width="100%" height={630}>
          <ComposedChart data={bankData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={52} />
            <Tooltip content={<ChartTooltip fmt={won} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {/* 극성 색 — 입금=초록(양수 숫자색과 통일), 출금=빨강. 카테고리 팔레트가 아닌 의미색 */}
            <Bar dataKey="입금" fill="hsl(var(--number-colored))" maxBarSize={18} />
            <Bar dataKey="출금" fill="hsl(var(--destructive))" maxBarSize={18} />
            <Line type="monotone" dataKey="월말 잔액" stroke={LINE} strokeWidth={2} dot={{ r: 2, fill: LINE }}>
              {/* 라벨이 잔액 선과 겹치지 않게 선 위 30px — 경사 구간에서도 선이 라벨을 안 지나가게 */}
              <LabelList dataKey="월말 잔액" position="top" offset={30} formatter={wonLabel} style={pointLabel} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  chartNodes.revenue = (
    <ChartCard key="revenue" id="revenue" onReorder={reorderChart} title="매출 추이" subtitle="점선=평균">
      <ResponsiveContainer width="100%" height={585}>
        <LineChart data={lineData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
          <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
          <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
          <ReferenceLine y={avgRev} stroke={REF} strokeDasharray="4 4" />
          {isPast && unit === 'month' && <ReferenceLine x={focusP} stroke={LINE2} strokeDasharray="2 4" />}
          <Line type="monotone" dataKey="매출" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }}>
            <LabelList dataKey="매출" position="top" offset={30} formatter={wonLabel} style={pointLabel} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  chartNodes.ebit = (
    <ChartCard key="ebit" id="ebit" onReorder={reorderChart} title="영업이익 추이" subtitle="EBIT · 당기순이익">
      <ResponsiveContainer width="100%" height={585}>
        <LineChart data={lineData} margin={{ top: 40, right: 16, bottom: 40, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
          <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
          <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
          <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
          <ReferenceLine y={0} stroke={REF} />
          {isPast && unit === 'month' && <ReferenceLine x={focusP} stroke={LINE2} strokeDasharray="2 4" />}
          <Line type="monotone" dataKey="EBIT" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }}>
            <LabelList dataKey="EBIT" position="top" offset={30} formatter={wonLabel} style={pointLabel} />
          </Line>
          <Line type="monotone" dataKey="순이익" stroke={LINE2} strokeWidth={1.5} dot={{ r: 2, fill: LINE2 }}>
            <LabelList dataKey="순이익" position="bottom" offset={30} formatter={wonLabel} style={pointLabel} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  if (unit === 'month' && hasCapex) {
    chartNodes.capex = (
      <ChartCard
        key="capex"
        id="capex"
        onReorder={reorderChart}
        title="감가상각 반영 영업이익"
        subtitle="자본적지출을 5년 정액 상각해 뺀 실질 영업이익 · 위 EBIT와 비교"
      >
        <ResponsiveContainer width="100%" height={585}>
          <LineChart data={depData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
            <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
            <ReferenceLine y={0} stroke={REF} />
            <Line type="monotone" dataKey="영업이익" stroke={LINE2} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2, fill: LINE2 }} />
            <Line type="monotone" dataKey="감가상각 반영" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }}>
              <LabelList dataKey="감가상각 반영" position="top" offset={30} formatter={wonLabel} style={pointLabel} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  chartNodes.ratio = (
    <ChartCard key="ratio" id="ratio" onReorder={reorderChart} title="손익 추이 %" subtitle="영업이익률 = EBIT ÷ 매출">
      <ResponsiveContainer width="100%" height={540}>
        <LineChart data={ratioData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={AXIS} width={44} />
          <Tooltip content={<ChartTooltip fmt={(v: number) => `${v}%`} />} />
          <ReferenceLine y={0} stroke={REF} />
          <Line type="monotone" dataKey="손익률" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }} connectNulls>
            <LabelList dataKey="손익률" position="top" offset={30} formatter={pctLabel} style={pointLabel} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  chartNodes.expense = (
    <ChartCard
      key="expense"
      id="expense"
      onReorder={reorderChart}
      title="지출 구분"
      subtitle={`월별 카테고리 지출(누적) · 오른쪽은 ${breakdownLabel} 구성비`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <ResponsiveContainer width="100%" height={675}>
            <BarChart data={barData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
              <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
              <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} share />} />
              {isPast && unit === 'month' && <ReferenceLine x={focusP} stroke={LINE2} strokeDasharray="2 4" />}
              {barKeys.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={colorOf(k, i)} stroke={CAT_SURFACE} strokeWidth={1}>
                  {i === barKeys.length - 1 && (
                    <LabelList dataKey="총지출" position="top" offset={30} formatter={wonLabel} style={pointLabel} />
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
  );

  chartNodes.cost = (
    <ChartCard key="cost" id="cost" onReorder={reorderChart} title="재료비 %" subtitle="원가율 = 재료비 ÷ 매출 · 카페 벤치마크 25~37%">
      <ResponsiveContainer width="100%" height={540}>
        <LineChart data={costData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={AXIS} width={44} />
          <Tooltip content={<ChartTooltip fmt={(v: number) => `${v}%`} />} />
          <ReferenceLine y={37} stroke={REF} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="재료비율" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }} connectNulls>
            <LabelList dataKey="재료비율" position="top" offset={30} formatter={pctLabel} style={pointLabel} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  if (unit === 'month' && brand === 'staffmeal' && menuQtyData.length > 0) {
    chartNodes.menu = (
      <ChartCard key="menu" id="menu" onReorder={reorderChart} title="메뉴 판매량 추이" subtitle="Newbie · Staff · Boss — 매장/포장 판매 수량(개)">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {MENU_TIERS.map((tier) => (
            <div key={tier}>
              <div className="mb-2 px-1 text-[12px] text-foreground">{tier}</div>
              <ResponsiveContainer width="100%" height={495}>
                <LineChart data={menuQtyData} margin={{ top: 30, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="p" tick={{ fontSize: 10, fill: AXIS }} stroke={AXIS} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: AXIS }} stroke={AXIS} width={30} />
                  <Tooltip content={<ChartTooltip fmt={(v: number) => `${Number(v).toLocaleString()}개`} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey={`${tier}-매장`} name="매장" stroke={LINE} strokeWidth={1.5} dot={{ r: 1.5, fill: LINE }} connectNulls />
                  <Line type="monotone" dataKey={`${tier}-포장`} name="포장" stroke={LINE2} strokeWidth={1.5} dot={{ r: 1.5, fill: LINE2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </ChartCard>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {isPast && (
        <div className="-mb-1 text-[13px] text-muted-foreground">
          좌측에서 고른 <b className="text-foreground">{focusP}</b> 기준 요약이에요 · 아래 추이 차트는 전체 기간
        </div>
      )}
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

      <div className="divide-y divide-border">
        {/* 1) 통장 입출금·잔액 — 분류와 무관한 통장 자체의 현금 흐름(대표 지시로 첫 차트, 2026-08-04).
            이제 차트 순서는 그립(⠿)을 드래그해 바꿀 수 있어 order 배열 순서대로 렌더링한다. */}
        {order.map((id) => chartNodes[id] ?? null)}
      </div>

      <p className="m-0 text-[11px] text-muted-foreground">
        {netVat
          ? '* 부가세 순액(공급가액) 기준 — 매출과 과세 매입(재료비·과세 판관비)을 총액÷1.1로 순액 처리. 인건비·이자·수도·세금 등 면세 항목은 그대로. 과세 여부는 설정(계정과목)에서 조정.'
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
    <div className="min-w-[150px] flex-[1_1_auto] rounded-md bg-muted/40 p-[14px_18px]">
      <div className="mb-[5px] text-[11px] text-muted-foreground">{label}</div>
      <div className="tabular text-[22px] text-foreground">{value}</div>
      {delta && <div className={`mt-[3px] text-[11px] ${delta.startsWith('▲') ? 'text-positive' : 'text-muted-foreground'}`}>전기 {delta}</div>}
    </div>
  );
}

function ChartCard({
  id,
  title,
  subtitle,
  children,
  onReorder,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  // 그립(⠿) 드래그 → 카드에 드롭 시 (드래그한 차트 id, 이 차트 id) 순서로 호출
  onReorder: (draggedId: string, targetId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId) onReorder(draggedId, id);
      }}
      className={`pb-[54px] pt-[54px] first:pt-0 last:pb-0 transition-colors ${dragOver ? 'bg-muted/30' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 px-1.5 pb-3">
        <div className="flex items-start gap-2">
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', id);
            }}
            title="드래그해서 차트 순서 바꾸기"
            className="mt-0.5 shrink-0 cursor-grab select-none text-[13px] leading-none tracking-tighter text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          >
            ⠿
          </span>
          <div>
            <h3 className="m-0 text-[15px] text-foreground">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={open}
          onClick={() => setOpen((v) => !v)}
          title={open ? '차트 접기' : '차트 펼치기'}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${open ? 'bg-primary' : 'bg-muted'}`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${open ? 'translate-x-[18px]' : 'translate-x-1'}`}
          />
        </button>
      </div>
      {open && children}
    </div>
  );
}
