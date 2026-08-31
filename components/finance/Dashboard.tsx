'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  LabelList,
} from 'recharts';
import { aggregate, capexDepreciation, capexByMonth, UNCLASSIFIED, type AggTx, type AggCat, type Unit, type MonthAgg } from '@/lib/finance/aggregate';
import { COST_NATURE_NOTES, COST_UNDETERMINED_LABEL } from '@/lib/finance/costNature';
import IncentiveSim from '@/components/finance/IncentiveSim';
import { bankShort } from '@/lib/finance/cashflow';
import { gramRuleFor } from '@/lib/finance/gramProducts';
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
const DEFAULT_CHART_ORDER = ['bank', 'revenue', 'brunch', 'ebit', 'capex', 'ratio', 'expense', 'nature', 'cost', 'avg', 'yoy', 'rain', 'weather', 'gift', 'menu'] as const;
type ChartId = (typeof DEFAULT_CHART_ORDER)[number];
const CHART_ORDER_KEY = 'finance-metrics-chart-order-v1';

const axisTick = { fontSize: 11, fill: AXIS };
// x축 각 지점마다 상시 노출하는 값 라벨 스타일
const pointLabel = { fontSize: 11, fill: AXIS };
const wonLabel = (v: any) => (v == null ? '' : manwon(Number(v)));
const pctLabel = (v: any) => (v == null ? '' : `${v}%`);

// 대여금 마커 — 통장 잔액 지점의 빨간 원 + 말풍선(문구·금액, 화살표로 지점 연결).
// 잔액 숫자 라벨이 선 '위'에 있어서 말풍선은 기본적으로 선 '아래'로 뺀다(2026-08-20 대표 요청).
// 잔액이 바닥권이라 아래 공간이 없는 달만 위로 올린다. 클릭하면 문구 수정(chart_annotations).
const LOAN_COLOR = 'hsl(var(--destructive))';
function LoanDot(props: any) {
  const { cx, cy, marker, onEdit, plotBottom } = props;
  if (cx == null || cy == null) return null;
  const below = plotBottom == null || cy + 88 <= plotBottom;
  const textY = below ? cy + 66 : Math.max(cy - 72, 14); // 첫 줄(문구) 기준선
  return (
    <g style={{ cursor: 'pointer' }} onClick={() => onEdit(marker)}>
      {/* 투명 히트 영역 — 링(fill:none)은 테두리만 클릭돼서 내부 클릭이 안 먹는다 */}
      <circle cx={cx} cy={cy} r={14} fill="transparent" stroke="none" />
      <circle cx={cx} cy={cy} r={9} fill="none" stroke={LOAN_COLOR} strokeWidth={2} />
      {below ? (
        <>
          <line x1={cx} y1={cy + 14} x2={cx} y2={textY - 14} stroke={LOAN_COLOR} strokeWidth={1} />
          <path d={`M ${cx - 3} ${cy + 19} L ${cx} ${cy + 13} L ${cx + 3} ${cy + 19}`} fill="none" stroke={LOAN_COLOR} strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={cx} y1={textY + 20} x2={cx} y2={cy - 14} stroke={LOAN_COLOR} strokeWidth={1} />
          <path d={`M ${cx - 3} ${cy - 19} L ${cx} ${cy - 13} L ${cx + 3} ${cy - 19}`} fill="none" stroke={LOAN_COLOR} strokeWidth={1} />
        </>
      )}
      <text x={cx} y={textY} textAnchor="middle" fontSize={11} fill={LOAN_COLOR}>
        {marker.label}
      </text>
      <text x={cx} y={textY + 14} textAnchor="middle" fontSize={11} fill={LOAN_COLOR}>
        −{manwon(Math.abs(marker.amount))}
      </text>
    </g>
  );
}

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
            <span>{fmt ? fmt(p.value, p.name) : p.value}</span>
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
  gramItems = [],
  weatherImpact = null,
  loanMarkers = [],
  channelFees = [],
  lumps = [],
  reportUnit,
  showIncentiveSim = false,
}: {
  txns: AggTx[];
  cats: AggCat[];
  posSales?: { saleDate: string; supply: number; brand?: string | null; store?: string | null; category?: string | null }[];
  // 통장 입출금·월말 잔액 월별 집계(서버 프리페치) — 첫 차트용. viewer는 빈 배열 → 차트 생략
  bankCash?: { ym: string; brand: string; bank: string; inflow: number; outflow: number; balance: number }[];
  // 스탭밀 상품별 판매량(finance.pos_items) — 메뉴 판매량 추이 차트 전용
  menuItems?: { saleDate: string; category: string; product: string; qty: number }[];
  // 날씨 × 매출 회귀 결과(/api/garden-weather-sales 의 Blob 캐시) — 가든 지점에서만.
  // 값은 '기준 밴드 대비 %'이고 t 는 유의성(|t|≥2 면 통상 유의). 재계산은 여기서 하지 않는다.
  weatherImpact?: {
    /** 일별 (영업일 × 강수 × 기온 × 매출) — '비 온 날 전부'를 보는 차트용 */
    daily?: { date: string; rain: number; tmax: number | null; sales: number }[];
    label: string;
    computedAt: string;
    n: number;
    r2: number;
    tempRef: string;
    effects: { label: string; pct: number; t: number; days: number }[];
    trendPct: number;
    holidayPct: number | null;
    holidayT: number | null;
  } | null;
  // 그램 단위 판매 상품(가든 양재천 '브런치바') 일별 행 — 매출 추이 옆 추이 차트 전용(2026-08-31).
  // supply=공급가액(매출 추이와 같은 기준), listPrice=정가 합(그램 역산 기준, gramProducts.ts).
  gramItems?: { saleDate: string; product: string; qty: number; supply: number; gross?: number; listPrice: number }[];
  // '대여금' 분류 거래의 (브랜드, 월)별 합계 — 통장 차트 빨간 원 마커. 서버(metrics/page)에서 프리페치.
  loanMarkers?: { brand: string; ym: string; amount: number; label: string }[];
  // 채널수수료 실입력(finance.channel_fees) — EBIT 차감(관리손익과 기준 통일). 없는 달은 1.7% 추정.
  // store: ''=브랜드 단위(레거시, 지점 뷰에선 안분) / 'yangjae'·'pangyo'=지점 실액(2026-08-23).
  channelFees?: { ym: string; amount: number; brand?: string | null; store?: string | null }[];
  // 미분해 지출 lump(finance.dashboard_lumps) — 명세 미연결 카드대금·세부 미수집 대체 출금.
  // 관리손익의 cardLump·payLump 와 같은 규칙으로 지표 EBIT에서도 차감(2026-08-21 감사 P4-7).
  lumps?: { brand: string; ym: string; kind: string; amount: number }[];
  // 상단 매장 필(FinanceNav ?unit=)이 정하는 브랜드+지점 — 이 화면 자체 토글은 없앴다(2026-08-19).
  // 'all' = 전사 통합(사업 브랜드 합산, 개인 제외) — 지표 페이지의 '전사 통합' 링크로 진입(2026-08-23).
  reportUnit: { brand: 'staffmeal' | 'garden' | 'all'; store: 'pangyo' | 'yangjae' | null };
  // 인센 시뮬레이션 노출 — 보상 설계 도구라 admin/classifier 만(서버 페이지에서 role 판정해 전달)
  showIncentiveSim?: boolean;
}) {
  const [unit, setUnit] = useState<Unit>('month');
  // 부가세 기준은 순액(공급가액) 단일 — 옛 '총액' 토글은 비용만 총액으로 바꾸고 매출(POS 공급가액)은
  // 그대로 두는 반쪽 모드라 EBIT을 왜곡했고, 회계 기준도 공급가액으로 확정돼 제거(2026-08-21 감사 D6).
  // 브랜드+지점은 상단 매장 필에서만 바뀐다 — 페이지가 서버에서 다시 그려지며 이 prop이 갱신된다.
  const segId: SegId =
    reportUnit.brand === 'all'
      ? 'all'
      : reportUnit.brand === 'staffmeal' ? 'staffmeal' : reportUnit.store === 'yangjae' ? 'garden-yangjae' : reportUnit.store === 'pangyo' ? 'garden-pangyo' : 'garden';
  const seg = SEGMENTS.find((s) => s.id === segId) ?? SEGMENTS[0];
  const { brand, store } = seg;
  // 좌측 연·월 사이드바(MonthShell)와 동기 — 고른 달의 요약 타일·구성비를 비춘다. 셸 밖(구 화면)이면 null → 최근 달.
  const ctx = useMonthCtx();

  // 전체 보기 차트 — recharts ResponsiveContainer 는 height 가 고정 숫자면 컨테이너 실측을
  // 무시하므로, 풀스크린은 CSS 덮어쓰기가 아니라 height 값 자체를 뷰포트 높이로 바꿔야 한다.
  const [fullId, setFullId] = useState<ChartId | null>(null);
  const [viewH, setViewH] = useState(800);
  useEffect(() => {
    const update = () => setViewH(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  // 130px = 오버레이 헤더(제목·닫기)+상하 패딩 몫
  const chartH = (id: ChartId, base: number) => (fullId === id ? viewH - 130 : base);
  // 노출(접기) 상태 — ←/→ 이동에서 꺼진 차트를 건너뛰어야 해서 카드가 아니라 여기서 든다
  const [openMap, setOpenMap] = useState<Partial<Record<ChartId, boolean>>>({});
  // ←/→ 순환 이동 — 어떤 차트가 실제로 그려졌는지(chartNodes)는 렌더 후반에야 알 수 있어 ref 로 배선
  const navFullRef = useRef<(dir: 1 | -1) => void>(() => {});
  const fullProps = (id: ChartId) => ({
    full: fullId === id,
    setFull: (v: boolean) => setFullId(v ? id : null),
    open: openMap[id] ?? true,
    setOpen: (v: boolean) => setOpenMap((m) => ({ ...m, [id]: v })),
    onNav: (dir: 1 | -1) => navFullRef.current(dir),
  });

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
  const { bankData, bankNames } = useMemo(() => {
    const rows =
      brand === 'all'
        ? bankCash.filter((r) => r.brand !== 'personal')
        : bankCash.filter((r) => (r.brand || 'garden') === brand);
    // 계좌 2개 이상(가든 양재)이면 합산 선 + 계좌별 선을 함께 그린다(2026-08-23 그릴 확정)
    const names = Array.from(new Set(rows.map((r) => r.bank))).sort();
    const byYm = new Map<string, { in: number; out: number; bal: number; perBank: Record<string, number> }>();
    for (const r of rows) {
      const a = byYm.get(r.ym) ?? { in: 0, out: 0, bal: 0, perBank: {} };
      a.in += r.inflow;
      a.out += r.outflow;
      a.bal += r.balance;
      a.perBank[r.bank] = (a.perBank[r.bank] ?? 0) + r.balance;
      byYm.set(r.ym, a);
    }
    const all = Array.from(byYm.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, a]) => ({
        p: ym.slice(2).replace('-', '.'),
        입금: a.in,
        출금: a.out,
        '월말 잔액': a.bal,
        ...(names.length >= 2
          ? Object.fromEntries(names.map((n) => [`잔액 · ${bankShort(n)}`, a.perBank[n] ?? 0]))
          : {}),
      }));
    const first = all.findIndex((d) => d.입금 !== 0 || d.출금 !== 0 || d['월말 잔액'] !== 0);
    return { bankData: first < 0 ? [] : all.slice(first), bankNames: names };
  }, [bankCash, brand]);
  // 대여금 마커 — 현재 브랜드 것만, 통장 차트의 그 달 잔액 지점에 붙인다.
  // 문구 수정은 낙관적으로 로컬(markerLabels)에 먼저 반영하고 chart_annotations에 저장.
  const [markerLabels, setMarkerLabels] = useState<Record<string, string>>({});
  const [markerEdit, setMarkerEdit] = useState<{ brand: string; ym: string } | null>(null);
  const [markerDraft, setMarkerDraft] = useState('');
  const [markerErr, setMarkerErr] = useState<string | null>(null);
  const bankMarkers = useMemo(() => {
    return loanMarkers
      .filter((m) => m.brand === brand)
      .map((m) => {
        const p = m.ym.slice(2).replace('-', '.');
        const row = bankData.find((d) => d.p === p);
        return row ? { ...m, p, balance: row['월말 잔액'], label: markerLabels[`${m.brand}|${m.ym}`] ?? m.label } : null;
      })
      .filter(Boolean) as { brand: string; ym: string; amount: number; label: string; p: string; balance: number }[];
  }, [loanMarkers, brand, bankData, markerLabels]);
  const startMarkerEdit = (m: { brand: string; ym: string; label: string }) => {
    setMarkerEdit({ brand: m.brand, ym: m.ym });
    setMarkerDraft(m.label);
    setMarkerErr(null);
  };
  const saveMarker = async () => {
    if (!markerEdit) return;
    const res = await fetch('/api/finance/chart-annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: markerEdit.brand, ym: markerEdit.ym, label: markerDraft.trim() }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setMarkerErr(j?.error ?? '저장에 실패했어요.');
      return;
    }
    // 빈 문구 = 오버라이드 삭제 → 기본 라벨로 복귀
    setMarkerLabels((prev) => ({ ...prev, [`${markerEdit.brand}|${markerEdit.ym}`]: markerDraft.trim() || '가든서비스 대여금' }));
    setMarkerEdit(null);
  };

  // 브랜드+지점 필터를 통과한 거래 — 손익 집계와 감가상각 차트가 같은 모집단을 쓴다
  // (감가상각만 무필터 원본을 쓰던 버그 수정, 2026-08-21 감사 P4-2).
  const filteredTx = useMemo(() => {
    // '전체'는 사업 브랜드만 — 개인(personal)은 손익 제외라 카테고리와 무관하게 뺀다.
    let tx = brand === 'all' ? txns.filter((t) => t.brand !== 'personal') : txns.filter((t) => (t.brand ?? 'garden') === brand);
    if (brand === 'garden' && store !== 'all') tx = tx.filter((t) => t.store === store);
    return tx;
  }, [txns, brand, store]);

  const { months, expenseKeys } = useMemo(() => {
    let pos = brand === 'all' ? posSales : posSales.filter((p) => (p.brand ?? 'garden') === brand);
    if (brand === 'garden' && store !== 'all') pos = pos.filter((p) => (p.store ?? '') === store);
    // 채널수수료 — 관리손익과 같은 기준으로 EBIT에서 차감(실입력 우선, 없으면 1.7% 추정).
    // 지점 실액(store 지정 행)은 그 지점에만, 브랜드 단위('') 레거시 입력분은 지점 뷰에서
    // 매출비율로 안분 — 관리손익(computePnlMonth)과 같은 규칙(2026-08-21 P4-3, 지점 차원 2026-08-23).
    const feeMap: Record<string, number> = {};
    const feeLump: Record<string, number> = {}; // 브랜드 단위('') 입력분 — 지점 뷰에서만 안분 대상
    for (const f of channelFees) {
      if (brand !== 'all' && (f.brand ?? 'garden') !== brand) continue;
      const fStore = f.store ?? '';
      if (store !== 'all') {
        if (fStore === store) feeMap[f.ym] = (feeMap[f.ym] ?? 0) + Number(f.amount || 0);
        else if (fStore === '') feeLump[f.ym] = (feeLump[f.ym] ?? 0) + Number(f.amount || 0);
        // 다른 지점 실액은 이 뷰 밖
      } else {
        feeMap[f.ym] = (feeMap[f.ym] ?? 0) + Number(f.amount || 0);
      }
    }
    if (brand === 'garden' && store !== 'all' && Object.keys(feeLump).length > 0) {
      const brandPos = posSales.filter((p) => (p.brand ?? 'garden') === 'garden');
      const supplyBy = (rows: typeof brandPos) => {
        const m: Record<string, number> = {};
        for (const p of rows) m[p.saleDate.slice(0, 7)] = (m[p.saleDate.slice(0, 7)] ?? 0) + p.supply;
        return m;
      };
      const brandSupply = supplyBy(brandPos);
      const storeSupply = supplyBy(brandPos.filter((p) => (p.store ?? '') === store));
      for (const ym of Object.keys(feeLump)) {
        const ratio = (brandSupply[ym] ?? 0) > 0 ? (storeSupply[ym] ?? 0) / brandSupply[ym] : 0;
        feeMap[ym] = (feeMap[ym] ?? 0) + Math.round(feeLump[ym] * ratio);
      }
    }
    const agg = aggregate(filteredTx, cats, unit, true, pos, { channelFees: feeMap });

    // 카드 미분해·대체 출금 백스톱 — 관리손익(buildPnl cardLump·payLump)과 같은 규칙(2026-08-21 P4-7):
    // 명세 미연결 카드대금 인출·세부 미수집 달의 쿠팡/네이버페이 대체 출금은 excluded 라 aggregate 가
    // 건너뛰지만, 빼먹으면 그 달 지출이 증발해 지표 EBIT만 낙관적으로 벌어진다. 월 단위·브랜드 뷰에서만
    // 더한다(주 단위는 월 키 데이터라 못 얹고, 지점 뷰는 lump 가 지점 미지정이라 관리손익도 0 — 동일).
    if (unit === 'month' && store === 'all' && lumps.length > 0) {
      const LUMP_LABEL: Record<string, string> = {
        card: '카드 지출(미분해)',
        coupang: '쿠팡(미분류)',
        naverpay: '네이버페이(미분류)',
      };
      const byYm = new Map(agg.months.map((m) => [m.ym, m]));
      const added = new Set<string>();
      for (const l of lumps) {
        if (brand === 'all' ? l.brand === 'personal' : l.brand !== brand) continue;
        const mo = byYm.get(l.ym);
        const label = LUMP_LABEL[l.kind] ?? l.kind;
        if (!mo || !(l.amount > 0)) continue;
        mo.sga += l.amount;
        mo.undeterminedCost += l.amount; // 성격 미상 — 고정/변동 어느 쪽에도 안 섞는다
        mo.ebit -= l.amount;
        mo.net -= l.amount;
        mo.profitRatio = mo.revenue > 0 ? mo.ebit / mo.revenue : null;
        mo.expense[label] = (mo.expense[label] || 0) + l.amount;
        added.add(label);
      }
      for (const k of Array.from(added)) if (!agg.expenseKeys.includes(k)) agg.expenseKeys.push(k);
    }
    return agg;
  }, [filteredTx, txns, cats, unit, posSales, channelFees, lumps, brand, store]);

  // 진행월(이번 달, KST) — POS·은행이 아직 덜 올라와 추이 끝점이 왜곡되므로 기본은 숨긴다(토글로 표시)
  const nowYm = useMemo(() => {
    const kst = new Date(Date.now() + 9 * 3600_000);
    return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
  }, []);
  // 진행월(이번 달)도 그대로 보여준다 — '자료가 올라온 달은 지출이 없어도 지표에 띄우라'는
  // 대표 지시(2026-08-31). 예전엔 끝점 왜곡을 막으려고 이번 달을 기본 숨김했는데, 월중에 POS를
  // 올려도 지표에 안 잡혀 "매출이 반영이 안 된다"고 보이는 쪽이 더 큰 문제였다.
  const visMonths = months;

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

  // 그램 상품(브런치바) 추이 — 매출 추이와 같은 기간 축. aggregate.periodKey 와 같은 규칙을 쓴다
  // (월: YYYY-MM / 주: 그 주 월요일) — 두 차트의 x축이 어긋나면 나란히 둔 의미가 없다.
  const periodKeyOf = (ymd: string) => {
    if (unit === 'month') return ymd.slice(0, 7);
    const d = new Date(ymd.slice(0, 10) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const gramProductName = gramItems[0]?.product ?? '';
  const gramData = useMemo(() => {
    if (gramItems.length === 0) return [];
    const byKey = new Map<string, { supply: number; qty: number; grams: number }>();
    for (const it of gramItems) {
      const rule = gramRuleFor(brand, store === 'all' ? '' : store, it.product, it.saleDate);
      const k = periodKeyOf(it.saleDate);
      const a = byKey.get(k) ?? { supply: 0, qty: 0, grams: 0 };
      a.supply += it.gross ?? it.supply; // 매출 표시는 총액(VAT 포함)
      a.qty += it.qty;
      if (rule) a.grams += it.listPrice / rule.wonPerGram;
      byKey.set(k, a);
    }
    return visMonths
      .map((m) => {
        const a = byKey.get(m.ym);
        if (!a) return null;
        return {
          p: fmtP(m.ym),
          매출: Math.round(a.supply),
          '평균 그램': a.qty > 0 && a.grams > 0 ? Math.round(a.grams / a.qty) : null,
          비중: m.revenueGross > 0 ? +((a.supply / m.revenueGross) * 100).toFixed(1) : null,
          건수: Math.round(a.qty),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gramItems, visMonths, unit, brand, store]);


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
      {unit === 'week' && (
        <span className="text-[11px] text-muted-foreground">
          주 단위는 현금흐름 관점 — 카드대금이 결제 주에 몰려 보여요. 손익 판단은 월 단위로.
        </span>
      )}
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
      const i = visMonths.findIndex((m) => m.ym === ctx.ym);
      if (i >= 0) return i;
    }
    return visMonths.length - 1;
  })();
  const last = visMonths[focusIdx];
  const prev = focusIdx > 0 ? visMonths[focusIdx - 1] : null;
  // 매출 표시는 총액(VAT 포함) — 손익 계산은 전부 revenue(공급가액) 그대로다(2026-08-31 대표 확정).
  // docs/finance-formulas.md 참조. 두 기준을 한 차트에 섞지 않도록, 총액 축에 그리는 값(평균선·
  // 손익분기선)은 그 달의 실효 부가세 비율(총액÷순액)로 환산해 올린다.
  const vatMulOf = (m: MonthAgg) => (m.revenue > 0 ? m.revenueGross / m.revenue : 1);
  const avgRev = visMonths.reduce((a, m) => a + m.revenueGross, 0) / visMonths.length;
  const isPast = focusIdx < visMonths.length - 1; // 최근이 아닌 과거 달을 보는 중
  const focusP = fmtP(last.ym); // 차트에서 선택 달 위치(강조선)

  // 손익분기 매출(BEP) — 고정비·변동비는 계정과목의 고정/변동 구분(cost_nature)을 따른다(2026-08-31,
  // 이전엔 '변동비=재료비+수수료, 고정비=판관비 전체'로 코드에 박혀 있었음). 채널수수료는 매출 비례라 변동.
  // 미분류·미상·미지정(미확정)은 성격을 모르는 지출이라 어느 쪽에도 안 넣는다 — 섞으면 미분류가 큰 달의
  // 손익분기선이 부풀어 오른다(2026-08-21 감사 P4-6). BEP = 고정비 ÷ (1 − 변동비율).
  const bepOf = (m: MonthAgg): number | null => {
    if (m.revenue <= 0) return null;
    const varRate = (m.variableCost + m.fee) / m.revenue;
    return varRate < 1 ? Math.round(m.fixedCost / (1 - varRate)) : null;
  };
  const lineData = visMonths.map((m) => ({
    p: fmtP(m.ym),
    매출: m.revenueGross, // 표시=총액(POS 화면과 대조되는 숫자)
    EBIT: m.ebit,
    순이익: m.net,
    손익분기: bepOf(m) == null ? null : Math.round((bepOf(m) as number) * vatMulOf(m)), // 총액 축으로 환산
  }));
  // 고정비·변동비 — 지출(원가+판관비)을 계정과목 고정/변동 구분으로 나눈 월별 스택. 변동비율 = 변동비 ÷ 매출.
  const natureData = visMonths.map((m) => ({
    p: fmtP(m.ym),
    고정비: m.fixedCost,
    변동비: m.variableCost,
    [COST_UNDETERMINED_LABEL]: m.undeterminedCost,
    총지출: m.cogs + m.sga,
    변동비율: m.revenue > 0 ? +((m.variableCost / m.revenue) * 100).toFixed(1) : null,
  }));
  const NATURE_KEYS = ['고정비', '변동비', COST_UNDETERMINED_LABEL] as const;
  const natureColor = (k: string) => (k === '고정비' ? CAT[1] : k === '변동비' ? CAT[0] : CAT_OTHER);
  // 감가상각(자본적지출 5년 정액) 반영 영업이익 — 비교용. 손익과 같은 필터(브랜드·지점) 모집단.
  const dep = capexDepreciation(filteredTx, cats);
  const hasCapex = Object.keys(dep).length > 0;
  const depData = visMonths.map((m) => ({ p: fmtP(m.ym), 영업이익: m.ebit, '감가상각 반영': m.ebit - (dep[m.ym] ?? 0) }));
  const ratioData = visMonths.map((m) => ({ p: fmtP(m.ym), 손익률: m.profitRatio != null ? +(m.profitRatio * 100).toFixed(1) : null }));
  // 원가 구조 — 재료비율·인건비율·Prime Cost. 인건비는 지출 구성의 '인건비' 최상위 합.
  // Prime Cost 분자는 식자재(포장재 제외)+인건비 — 관리손익 primeCost 와 같은 정의로 통일
  // (지표만 포장재를 포함해 항상 높게 나오던 불일치 수정, 2026-08-21 감사 P4-5).
  const costData = visMonths.map((m) => {
    const labor = m.expense['인건비'] || 0;
    const food = m.cogs - (m.expense['포장재'] || 0);
    const pct = (v: number) => (m.revenue > 0 ? +((v / m.revenue) * 100).toFixed(1) : null);
    return { p: fmtP(m.ym), 재료비율: pct(m.cogs), 인건비율: pct(labor), 'Prime Cost': pct(food + labor) };
  });
  // 객단가 × 식수 — 스탭밀 전용. 식수 = 메뉴 티어(Staff·Newbie·Boss) 판매 수량 합(스프·음료 제외),
  // 객단가 = (매출 − 식권판매) ÷ 식수. 식권은 식사 제공이 아니라 판매 시점 선매출이라 뺀다.
  const giftByYm = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posSales) {
      if (brand !== 'all' && (p.brand ?? 'garden') !== brand) continue;
      if (store !== 'all' && (p.store ?? '') !== store) continue; // 분모(m.revenue)와 같은 지점 필터(2026-08-21 P4-4)
      if ((p.category ?? '') !== '식권판매') continue;
      const ym = p.saleDate.slice(0, 7);
      map.set(ym, (map.get(ym) ?? 0) + p.supply);
    }
    return map;
  }, [posSales, brand, store]);
  const avgTicketData = useMemo(() => {
    if (brand !== 'staffmeal' || unit !== 'month') return [];
    const meals = new Map<string, number>();
    for (const it of menuItems) {
      if (!tierOf(it.product)) continue;
      const ym = it.saleDate.slice(0, 7);
      meals.set(ym, (meals.get(ym) ?? 0) + it.qty);
    }
    return visMonths
      .map((m) => {
        const n = meals.get(m.ym) ?? 0;
        const menuRev = m.revenue - (giftByYm.get(m.ym) ?? 0);
        return { p: fmtP(m.ym), 식수: n, 객단가: n > 0 ? Math.round(menuRev / n) : null };
      })
      .filter((r) => r.식수 > 0);
  }, [brand, unit, menuItems, visMonths, giftByYm]);
  // 전년 동월(YoY) — 최근 12개 표시 달 vs 1년 전 같은 달
  const yoyData = useMemo(() => {
    if (unit !== 'month') return [];
    const revByYm = new Map(months.map((m) => [m.ym, m.revenueGross])); // 매출 표시는 총액
    return visMonths.slice(-12).map((m) => {
      const [y, mm] = m.ym.split('-').map(Number);
      const prevYm = `${y - 1}-${String(mm).padStart(2, '0')}`;
      return { p: fmtP(m.ym), 올해: m.revenueGross, 전년: revByYm.get(prevYm) ?? null };
    });
  }, [unit, months, visMonths]);
  // 식권 판매 비중 — 선매출(식권) 의존도. 식권판매 ÷ 총매출
  const giftShareData = useMemo(() => {
    if (unit !== 'month') return [];
    return visMonths
      .map((m) => {
        const g = giftByYm.get(m.ym) ?? 0;
        return { p: fmtP(m.ym), '식권 비중': m.revenue > 0 ? +((g / m.revenue) * 100).toFixed(1) : null, 식권판매: g };
      })
      .filter((r) => r['식권 비중'] != null);
  }, [unit, visMonths, giftByYm]);
  const hasGift = giftShareData.some((r) => (r.식권판매 ?? 0) > 0);
  // 지출 카테고리를 총액 큰 순으로 세우고, 8색을 넘기면 나머지는 '기타'로 접음(색 순환·중복 방지)
  const totalByKey: Record<string, number> = {};
  for (const m of visMonths) for (const k of expenseKeys) totalByKey[k] = (totalByKey[k] || 0) + (m.expense[k] || 0);
  const ranked = [...expenseKeys].filter((k) => (totalByKey[k] || 0) > 0).sort((a, b) => (totalByKey[b] || 0) - (totalByKey[a] || 0));
  const hasOther = ranked.length > CAT_MAX;
  const topKeys = hasOther ? ranked.slice(0, CAT_MAX - 1) : ranked;
  const otherKeys = hasOther ? ranked.slice(CAT_MAX - 1) : [];
  const barKeys = hasOther ? [...topKeys, '기타'] : topKeys;
  const colorOf = (k: string, i: number) => (k === '기타' || k === UNCLASSIFIED ? CAT_OTHER : CAT[i]);
  const barData = visMonths.map((m) => {
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
  // '이번 달'은 실제 진행월을 볼 때만 — 진행월 기본 숨김 상태의 마지막 달(=지난달)을 '이번 달'로
  // 부르던 라벨 오류 수정(2026-08-21 감사 P4-4). 그 외엔 달 이름을 그대로 쓴다.
  const unitLabel = unit === 'month' ? (last.ym === nowYm ? '이번 달' : `${focusP}`) : '이번 주';

  // 차트별 노드 — order 배열 순서대로 렌더링(드래그로 순서 변경). 조건부로 안 그리는 차트는 키 자체를 비움.
  const chartNodes: Partial<Record<ChartId, React.ReactNode>> = {};
  if (unit === 'month' && bankData.length > 0) {
    chartNodes.bank = (
      <ChartCard
        key="bank"
        id="bank"
        {...fullProps('bank')}
        onReorder={reorderChart}
        title="통장 입출금·잔액"
        subtitle={`월별 입금·출금(막대)과 월말 잔액(선) · 분류 무관 통장 기준${
          brand === 'garden' && store !== 'all' ? ' · 통장은 가든 공용(지점 구분 없음)' : ''
        }`}
      >
        {/* 대여금 마커 문구 수정 — 차트의 빨간 원을 클릭하면 열린다 */}
        {markerEdit && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">{markerEdit.ym} 대여금 표기:</span>
            <input
              value={markerDraft}
              onChange={(e) => setMarkerDraft(e.target.value)}
              maxLength={40}
              className="w-[220px] rounded-md border border-border bg-background px-2 py-1 text-foreground"
              placeholder="가든서비스 대여금"
            />
            <button onClick={saveMarker} className="rounded-md bg-primary px-2.5 py-1 text-primary-foreground">
              저장
            </button>
            <button onClick={() => setMarkerEdit(null)} className="rounded-md border border-border px-2.5 py-1 text-muted-foreground">
              취소
            </button>
            <span className="text-muted-foreground">비우고 저장하면 기본 문구로 돌아가요</span>
            {markerErr && <span className="text-destructive">{markerErr}</span>}
          </div>
        )}
        <ResponsiveContainer width="100%" height={chartH('bank', 630)}>
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
            {/* 계좌별 잔액 — 계좌 2개 이상(가든 양재)일 때만 가는 점선으로 병행(2026-08-23 그릴 확정) */}
            {bankNames.length >= 2 &&
              bankNames.map((n) => (
                <Line
                  key={`bal-${n}`}
                  type="monotone"
                  dataKey={`잔액 · ${bankShort(n)}`}
                  stroke={LINE2}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  dot={{ r: 1.5, fill: LINE2 }}
                />
              ))}
            {/* 대여금 마커 — '대여금' 분류 거래가 있는 달의 잔액 지점. 클릭하면 문구 수정 */}
            {bankMarkers.map((m) => (
              <ReferenceDot
                key={`loan-${m.brand}-${m.ym}`}
                x={m.p}
                y={m.balance}
                shape={<LoanDot marker={m} onEdit={startMarkerEdit} plotBottom={chartH('bank', 630) - 120} />}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  const revenueCard = (
    <ChartCard
      key="revenue"
      id="revenue"
      {...fullProps('revenue')}
      onReorder={reorderChart}
      title="매출 추이"
      subtitle="부가세 포함 매출(POS 실매출과 같은 기준) · 점선=평균 · 빨간 점선=손익분기 매출(고정비 ÷ (1−변동비율), 순액 산식을 총액 축으로 환산)"
    >
      <ResponsiveContainer width="100%" height={chartH('revenue', 585)}>
        <LineChart data={lineData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
          <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
          <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
          <ReferenceLine y={avgRev} stroke={REF} strokeDasharray="4 4" />
          {isPast && unit === 'month' && <ReferenceLine x={focusP} stroke={LINE2} strokeDasharray="2 4" />}
          <Line
            type="monotone"
            dataKey="손익분기"
            stroke="hsl(var(--destructive))"
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
          />
          <Line type="monotone" dataKey="매출" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }}>
            <LabelList dataKey="매출" position="top" offset={30} formatter={wonLabel} style={pointLabel} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // 그램 상품(브런치바) 추이 — 매출 추이 오른쪽에 나란히(2026-08-31 대표 지시).
  // 막대=매출(공급가액, 매출 추이와 같은 기준), 선=평균 그램(오른쪽 축). 그램 규칙이 있는
  // 지점·상품에서만 그린다(gramProducts.ts) — 지금은 가든 양재천 '브런치바'.
  const brunchCard =
    gramData.length > 0 ? (
      <ChartCard
        key="brunch"
        id="brunch"
        {...fullProps('brunch')}
        onReorder={reorderChart}
        title={`${gramProductName} 추이`}
        subtitle="막대=매출(부가세 포함) · 선=평균 그램(정가 ÷ 그램당 단가) · 라벨=매장 매출 대비 비중"
      >
        <ResponsiveContainer width="100%" height={chartH('brunch', 585)}>
          <ComposedChart data={gramData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis yAxisId="left" tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => `${v}g`}
              tick={axisTick}
              stroke={AXIS}
              width={44}
              domain={['dataMin - 50', 'dataMax + 50']}
            />
            <Tooltip
              content={
                <ChartTooltip
                  fmt={(v: number, name?: string) =>
                    name === '평균 그램' ? `${Number(v).toLocaleString()}g` : name === '비중' ? `${v}%` : won(Number(v))
                  }
                />
              }
            />
            <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
            {isPast && unit === 'month' && <ReferenceLine x={focusP} stroke={LINE2} strokeDasharray="2 4" />}
            <Bar yAxisId="left" dataKey="매출" fill={CAT[0]} radius={[3, 3, 0, 0]} maxBarSize={46}>
              <LabelList dataKey="비중" position="top" offset={8} formatter={pctLabel} style={pointLabel} />
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="평균 그램"
              stroke={LINE2}
              strokeWidth={1.5}
              dot={{ r: 2, fill: LINE2 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    ) : null;

  // 매출 추이 + 브런치바 추이를 한 행(2열)으로 — 브런치바가 없는 단위에선 매출 추이만 전폭.
  chartNodes.revenue = brunchCard ? (
    <div key="revenue-row" className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
      {revenueCard}
      {brunchCard}
    </div>
  ) : (
    revenueCard
  );

  chartNodes.ebit = (
    <ChartCard key="ebit" id="ebit" {...fullProps('ebit')} onReorder={reorderChart} title="영업이익 추이" subtitle="EBIT · 당기순이익 · 채널수수료 차감(실입력 없는 달은 1.7% 추정) · 부가세 납부는 예수금 정산이라 지출 제외">
      <ResponsiveContainer width="100%" height={chartH('ebit', 585)}>
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
          <Line type="monotone" dataKey="순이익" stroke={LINE2} strokeWidth={1.5} dot={{ r: 2, fill: LINE2 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  if (unit === 'month' && hasCapex) {
    chartNodes.capex = (
      <ChartCard
        key="capex"
        id="capex"
        {...fullProps('capex')}
        onReorder={reorderChart}
        title="감가상각 반영 영업이익"
        subtitle="자본적지출을 5년 정액 상각해 뺀 실질 영업이익 · 위 EBIT와 비교"
      >
        <ResponsiveContainer width="100%" height={chartH('capex', 585)}>
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
    <ChartCard key="ratio" id="ratio" {...fullProps('ratio')} onReorder={reorderChart} title="손익 추이 %" subtitle="영업이익률 = EBIT ÷ 매출">
      <ResponsiveContainer width="100%" height={chartH('ratio', 540)}>
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
      {...fullProps('expense')}
      onReorder={reorderChart}
      title="지출 구분"
      subtitle={`월별 카테고리 지출(누적) · 오른쪽은 ${breakdownLabel} 구성비`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <ResponsiveContainer width="100%" height={chartH('expense', 675)}>
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

  // 고정비·변동비 — 오른쪽은 선택 달 구성(금액·지출 대비 비중), 아래는 분류 결정 노트(costNature.ts).
  const natureLast = natureData[focusIdx];
  const natureBreakdown = natureLast
    ? NATURE_KEYS.map((k) => {
        const value = Number(natureLast[k] ?? 0);
        return { name: k, value, pct: natureLast.총지출 > 0 ? (value / natureLast.총지출) * 100 : 0, color: natureColor(k) };
      }).filter((b) => b.value !== 0)
    : [];
  chartNodes.nature = (
    <ChartCard
      key="nature"
      id="nature"
      {...fullProps('nature')}
      onReorder={reorderChart}
      title="고정비 · 변동비"
      subtitle={`지출(원가+판관비)을 계정과목의 고정/변동 구분으로 나눈 월별 누적 · 오른쪽은 ${breakdownLabel} 구성 · 변동비율 = 변동비 ÷ 매출`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <ResponsiveContainer width="100%" height={chartH('nature', 585)}>
            <BarChart data={natureData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
              <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
              <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} share />} />
              {isPast && unit === 'month' && <ReferenceLine x={focusP} stroke={LINE2} strokeDasharray="2 4" />}
              {NATURE_KEYS.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="n" fill={natureColor(k)} stroke={CAT_SURFACE} strokeWidth={1}>
                  {i === NATURE_KEYS.length - 1 && (
                    <LabelList dataKey="총지출" position="top" offset={30} formatter={wonLabel} style={pointLabel} />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full shrink-0 md:w-[230px]">
          <ul className="flex flex-col gap-1.5">
            {natureBreakdown.map((b) => (
              <li key={b.name} className="flex items-center gap-2 text-[11px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: b.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground" title={b.name}>{b.name}</span>
                <span className="tabular shrink-0 text-[11px] text-muted-foreground">{won(b.value)}</span>
                <span className="tabular w-[46px] shrink-0 text-right font-medium text-foreground">{b.pct.toFixed(1)}%</span>
              </li>
            ))}
            {natureLast?.변동비율 != null && (
              <li className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-[11px]">
                <span className="text-muted-foreground">변동비율(매출 대비)</span>
                <span className="tabular font-medium text-foreground">{natureLast.변동비율}%</span>
              </li>
            )}
          </ul>
        </div>
      </div>
      <ul className="mt-4 flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
        {COST_NATURE_NOTES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </ChartCard>
  );

  chartNodes.cost = (
    <ChartCard
      key="cost"
      id="cost"
      {...fullProps('cost')}
      onReorder={reorderChart}
      title="원가 구조 %"
      subtitle="Prime Cost = 식자재(포장재 제외)+인건비 — 관리손익과 같은 정의 (F&B 목표 ≤60%) · 재료비 25~37% · 인건비 25~30%"
    >
      <ResponsiveContainer width="100%" height={chartH('cost', 540)}>
        <LineChart data={costData} margin={{ top: 40, right: 16, bottom: 40, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={AXIS} width={44} />
          <Tooltip content={<ChartTooltip fmt={(v: number) => `${v}%`} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine
            y={60}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 4"
            label={{
              value: 'Prime Cost 목표 ≤60%',
              position: 'insideRight',
              fill: 'hsl(var(--destructive))',
              fontSize: 11,
              dy: -9,
            }}
          />
          <Line type="monotone" dataKey="Prime Cost" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }} connectNulls>
            <LabelList dataKey="Prime Cost" position="top" offset={30} formatter={pctLabel} style={pointLabel} />
          </Line>
          <Line type="monotone" dataKey="재료비율" stroke={LINE2} strokeWidth={1.5} dot={{ r: 1.5, fill: LINE2 }} connectNulls />
          <Line type="monotone" dataKey="인건비율" stroke={CAT[2]} strokeWidth={1.5} dot={{ r: 1.5 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  if (unit === 'month' && avgTicketData.length > 0) {
    chartNodes.avg = (
      <ChartCard
        key="avg"
        id="avg"
        {...fullProps('avg')}
        onReorder={reorderChart}
        title="식수·객단가"
        subtitle="식수 = Staff·Newbie·Boss 판매 수량(막대) · 객단가 = (매출−식권판매) ÷ 식수(선)"
      >
        <ResponsiveContainer width="100%" height={chartH('avg', 585)}>
          <ComposedChart data={avgTicketData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis yAxisId="n" tickFormatter={(v) => `${Number(v).toLocaleString()}`} tick={axisTick} stroke={AXIS} width={48} />
            <YAxis yAxisId="w" orientation="right" tickFormatter={(v) => `${Number(v).toLocaleString()}원`} tick={axisTick} stroke={AXIS} width={62} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => Number(v).toLocaleString('ko-KR')} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="n" dataKey="식수" fill={CAT[1]} maxBarSize={18} />
            <Line yAxisId="w" type="monotone" dataKey="객단가" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }} connectNulls>
              <LabelList dataKey="객단가" position="top" offset={30} formatter={(v: any) => (v == null ? '' : `${Number(v).toLocaleString()}원`)} style={pointLabel} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  if (unit === 'month' && yoyData.some((r) => r.전년 != null)) {
    chartNodes.yoy = (
      <ChartCard key="yoy" id="yoy" {...fullProps('yoy')} onReorder={reorderChart} title="전년 동월 비교" subtitle="최근 12개월 매출 vs 1년 전 같은 달">
        <ResponsiveContainer width="100%" height={chartH('yoy', 540)}>
          <BarChart data={yoyData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => won(Number(v))} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="전년" fill={CAT_OTHER} maxBarSize={16} />
            <Bar dataKey="올해" fill={CAT[0]} maxBarSize={16}>
              <LabelList dataKey="올해" position="top" offset={8} formatter={wonLabel} style={pointLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  // 식권은 스탭밀 제도 — 가든의 gift 행은 금액권·선불권(상품권)이라 '식권'으로 부르면 오해다.
  // 가든 세그먼트에선 이 차트를 그리지 않는다(2026-08-31 대표 지시). 전사 통합은 스탭밀 몫이
  // 실재하므로 유지.
  // 날씨 × 매출 — 밴드별 효과(기준 대비 %). 계산은 가든 '날씨 분석'이 하루 한 번 하고
  // 여기선 그 결과만 그린다(2026-08-31 대표 요청). |t|≥2 = 통계적으로 뚜렷 → 진한 색.
  if (weatherImpact && weatherImpact.effects.length > 0) {
    const wd = weatherImpact.effects
      .filter((e) => e.days >= 3) // 관측 3일 미만 밴드는 계수가 튀어 의미가 없다
      .map((e) => ({ p: e.label, 효과: +e.pct.toFixed(1), sig: Math.abs(e.t) >= 2, days: e.days }));
    const computed = weatherImpact.computedAt?.slice(0, 10) ?? '';
    // 일별 강수 × 매출 — 비 온 날을 하나도 빠뜨리지 않고 보려는 요구(2026-08-31 대표).
    // 세로 막대=그날 강수량(오른쪽 축, 위로 자랄수록 많이 온 날), 선=그날 매출(왼쪽 축).
    const rainDaily = (weatherImpact.daily ?? []).map((d) => ({
      p: d.date.slice(5).replace('-', '/'),
      강수량: d.rain,
      매출: d.sales,
      tmax: d.tmax,
    }));
    const rainyDays = rainDaily.filter((d) => d.강수량 >= 1).length;
    const heavyDays = rainDaily.filter((d) => d.강수량 >= 20).length;
    const bandLine = weatherImpact.effects
      .filter((e) => Math.abs(e.t) >= 2 && e.days >= 3)
      .map((e) => `${e.label} ${e.pct > 0 ? '+' : ''}${e.pct.toFixed(0)}%`)
      .join(' · ');

    if (rainDaily.length > 0) {
      chartNodes.rain = (
        <ChartCard
          key="rain"
          id="rain"
          {...fullProps('rain')}
          onReorder={reorderChart}
          title="강수 × 일 매출"
          subtitle={`영업일 ${rainDaily.length}일 전부 · 비 온 날 ${rainyDays}일(그중 20mm+ 폭우 ${heavyDays}일) · 막대=그날 강수량(오른쪽 축) · 선=그날 매출(부가세 포함)`}
        >
          <ResponsiveContainer width="100%" height={chartH('rain', 460)}>
            <ComposedChart data={rainDaily} margin={{ top: 16, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="p" tick={axisTick} stroke={AXIS} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="left" tickFormatter={manwon} tick={axisTick} stroke={AXIS} width={48} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `${v}mm`}
                tick={axisTick}
                stroke={AXIS}
                width={48}
              />
              <Tooltip
                content={
                  <ChartTooltip fmt={(v: number, name?: string) => (name === '강수량' ? `${v}mm` : won(Number(v)))} />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
              <Bar yAxisId="right" dataKey="강수량" maxBarSize={14} radius={[2, 2, 0, 0]}>
                {rainDaily.map((d, i) => (
                  // 20mm+ = 매출이 실제로 꺾이는 구간(회귀에서 −30% 안팎) — 진하게 구분
                  <Cell key={i} fill={d.강수량 >= 20 ? 'hsl(var(--destructive))' : CAT[0]} fillOpacity={d.강수량 >= 20 ? 0.9 : 0.4} />
                ))}
              </Bar>
              <Line yAxisId="left" type="monotone" dataKey="매출" stroke={LINE} strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          {bandLine && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              회귀로 본 뚜렷한 효과(|t|≥2): <b className="text-foreground">{bandLine}</b> — 기준 {weatherImpact.tempRef}·비
              1mm 미만. 아래 밴드 차트가 같은 값이에요.
            </p>
          )}
        </ChartCard>
      );
    }

    chartNodes.weather = (
      <ChartCard
        key="weather"
        id="weather"
        {...fullProps('weather')}
        onReorder={reorderChart}
        title="날씨 영향 — 일 매출"
        subtitle={`기준 = 기온 ${weatherImpact.tempRef} · 비 1mm 미만인 날. 막대 = 기준 대비 %(요일·공휴일·성장 트렌드 통제) · 진한 막대는 통계적으로 뚜렷(|t|≥2) · 표본 ${weatherImpact.n}일 · R² ${weatherImpact.r2.toFixed(2)} · ${computed} 기준`}
      >
        <ResponsiveContainer width="100%" height={chartH('weather', 420)}>
          <BarChart data={wd} layout="vertical" margin={{ top: 8, right: 56, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={AXIS} />
            <YAxis type="category" dataKey="p" tick={axisTick} stroke={AXIS} width={80} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => `${v}%`} />} />
            <ReferenceLine x={0} stroke={REF} />
            <Bar dataKey="효과" radius={[0, 3, 3, 0]} maxBarSize={22}>
              {wd.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.효과 < 0 ? 'hsl(var(--destructive))' : CAT[0]}
                  fillOpacity={d.sig ? 1 : 0.35}
                />
              ))}
              <LabelList dataKey="효과" position="right" formatter={pctLabel} style={pointLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[11px] text-muted-foreground">
          성장 트렌드 {weatherImpact.trendPct > 0 ? '+' : ''}
          {weatherImpact.trendPct.toFixed(0)}%(기간 처음→끝, 날씨와 별개)
          {weatherImpact.holidayPct != null &&
            ` · 공휴일 ${weatherImpact.holidayPct > 0 ? '+' : ''}${weatherImpact.holidayPct.toFixed(0)}%${
              Math.abs(weatherImpact.holidayT ?? 0) >= 2 ? '' : '(불유의)'
            }`}
          {' · 계산은 '}
          <a href="/garden/weather" className="underline">가든 → 날씨 분석</a>
          에서 갱신해요.
        </p>
      </ChartCard>
    );
  }

  if (unit === 'month' && hasGift && brand !== 'garden') {
    chartNodes.gift = (
      <ChartCard
        key="gift"
        id="gift"
        {...fullProps('gift')}
        onReorder={reorderChart}
        title="식권 판매 비중"
        subtitle="식권판매 ÷ 총매출 — 선매출(식권) 의존도. 높을수록 미래 식사 제공 의무가 쌓여요"
      >
        <ResponsiveContainer width="100%" height={chartH('gift', 540)}>
          <LineChart data={giftShareData} margin={{ top: 40, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="p" tick={axisTick} stroke={AXIS} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={axisTick} stroke={AXIS} width={44} />
            <Tooltip content={<ChartTooltip fmt={(v: number) => `${v}%`} />} />
            <Line type="monotone" dataKey="식권 비중" stroke={LINE} strokeWidth={1.5} dot={{ r: 2, fill: LINE }} connectNulls>
              <LabelList dataKey="식권 비중" position="top" offset={30} formatter={pctLabel} style={pointLabel} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  if (unit === 'month' && brand === 'staffmeal' && menuQtyData.length > 0) {
    chartNodes.menu = (
      <ChartCard key="menu" id="menu" {...fullProps('menu')} onReorder={reorderChart} title="메뉴 판매량 추이" subtitle="Newbie · Staff · Boss — 매장/포장 판매 수량(개)">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {MENU_TIERS.map((tier) => (
            <div key={tier}>
              <div className="mb-2 px-1 text-[12px] text-foreground">{tier}</div>
              <ResponsiveContainer width="100%" height={chartH('menu', 495)}>
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
      {/* 요약 타일(매출·지출·고정비·변동비·EBIT·순이익)과 좌측 연·월 사이드바는 제거했다
          (2026-08-31 대표 지시) — 월 단위 숫자는 관리손익·월 결산에서 보고, 이 화면은 추이 전용. */}
      <div className="flex flex-wrap items-center justify-end gap-3">{toggle}</div>
      {visMonths.length > 0 && last.revenue === 0 && (
        <div className="-mt-2 text-[11px] text-muted-foreground">
          이 기간 <b>POS 매출이 없어요</b> — 매출은 <a href="/finance/pnl" className="underline">관리손익</a>에서 토스 매출리포트를 올려야 잡혀요.
        </div>
      )}
      {/* 전사 통합 — 브랜드 간 대여금 상계 카드(2026-08-23, G6). 대여금은 excluded 분류라 손익엔
          비중복이고, 전사 '잔고' 관점에서 서로 상쇄되는 내부 채권·채무임을 숫자로 보여준다 */}
      {segId === 'all' && loanMarkers.length > 0 && (() => {
        const byBrand = new Map<string, number>();
        for (const m of loanMarkers) byBrand.set(m.brand, (byBrand.get(m.brand) ?? 0) + m.amount);
        const entries = Array.from(byBrand.entries()).filter(([, v]) => v !== 0);
        if (entries.length === 0) return null;
        const bl = (b: string) => (b === 'staffmeal' ? '스탭밀' : b === 'garden' ? '가든서비스' : b);
        return (
          <div className="-mt-2 rounded-md bg-muted/40 px-4 py-3 text-[13px]">
            <span className="font-medium">브랜드 간 대여 순잔액</span>
            <span className="ml-3 tabular-nums text-muted-foreground">
              {entries.map(([b, v]) => `${bl(b)} 장부 ${v > 0 ? '순대여 +' : '순차입 −'}${Math.abs(v).toLocaleString()}원`).join(' · ')}
            </span>
            <span className="ml-2 text-[11px] text-muted-foreground">
              — 브랜드 간 이동(대여금 계정)이라 손익엔 안 잡히고, 전사 합산 잔고에서는 서로 상쇄돼요.
            </span>
          </div>
        );
      })()}
      {/* 판교 손익의 성격 고지(2026-08-23, 지점 분리 회계 확정에 따른 안내) — 판교는 통장·카드 지출이
          없고 인건비·임대료가 스탭밀 장부 귀속(대표 확정)이라, 이 숫자는 완전한 지점 손익이 아니다 */}
      {segId === 'garden-pangyo' && (
        <div className="-mt-2 text-[11px] text-muted-foreground">
          ⓘ 판교 손익은 <b>기여이익 성격</b>이에요 — 판교는 통장·카드 지출이 없고(수집분·POS만) 인건비·임대료는 스탭밀 장부에
          귀속돼 있어(대표 확정), 여기 영업이익은 그 비용들을 빼기 전 숫자예요.
        </div>
      )}

      <div className="divide-y divide-border">
        {/* 1) 통장 입출금·잔액 — 분류와 무관한 통장 자체의 현금 흐름(대표 지시로 첫 차트, 2026-08-04).
            이제 차트 순서는 그립(⠿)을 드래그해 바꿀 수 있어 order 배열 순서대로 렌더링한다. */}
        {(() => {
          // 전체 보기 ←/→ 이동 — 표시 순서(order)대로 순환, 안 그려졌거나 노출이 꺼진 차트는 건너뛴다
          navFullRef.current = (dir) => {
            setFullId((cur) => {
              if (!cur) return cur;
              const pool = order.filter((cid) => chartNodes[cid] && ((openMap[cid] ?? true) || cid === cur));
              if (pool.length === 0) return cur;
              const i = pool.indexOf(cur);
              return pool[(i + dir + pool.length) % pool.length] ?? cur;
            });
          };
          return null;
        })()}
        {order.map((id) => chartNodes[id] ?? null)}
      </div>

      {/* 인센 시뮬레이션(2026-08-23 대표 결정) — 인센 기준 = EBIT − 투자 상각(개월수 가변).
          월 단위·단일 세그먼트에서만(전사 통합은 투자 귀속이 섞여 무의미), 진행월 제외(visMonths)는
          차트와 같은 규칙. 손익 3형제 산식은 무변경 — 이 카드만의 파생 계산이다. */}
      {showIncentiveSim && unit === 'month' && segId !== 'all' && (
        <IncentiveSim
          months={visMonths.map((m) => ({ ym: m.ym, ebit: m.ebit }))}
          capexOut={capexByMonth(filteredTx, cats)}
          segId={segId}
          segLabel={seg.label}
        />
      )}

      <p className="m-0 text-[11px] text-muted-foreground">
        * 매출 표시는 부가세 포함(POS 실매출과 같은 기준), 손익 계산은 공급가액(순액) 기준이에요 — 매출은 품목별 부가세액을 빼서, 과세 매입(재료비·과세 판관비)은 총액÷1.1로 순액 처리. 인건비·이자·수도·세금 등
        면세 항목은 그대로. 과세 여부는 설정(계정과목)에서 조정. 미분류·미상 지출은 비용으로 반영하고(이익 과대 방지), 미분류
        입금은 대출·자본유입일 수 있어 매출에 넣지 않아요 — 분류하면 정확한 계정으로 옮겨가요. 명세 미연결 카드대금·세부 미수집
        대체 출금은 관리손익과 같은 규칙으로 &lsquo;카드 지출(미분해)&rsquo; 등 지출에 포함해요. 자본적지출·보증금·내부이체·부가세
        납부(예수금 정산)는 손익 제외. 기말재고는 관리손익에서만 반영(지표 재료비 = 당월 매입). 감가상각 미반영(EBIT=EBITDA).
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
  full,
  setFull,
  open,
  setOpen,
  onNav,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  // 그립(⠿) 드래그 → 카드에 드롭 시 (드래그한 차트 id, 이 차트 id) 순서로 호출
  onReorder: (draggedId: string, targetId: string) => void;
  // 전체 보기 — 상태는 Dashboard 가 들고 차트 height 에 반영한다(recharts 가 고정 height 를 쓰므로)
  full: boolean;
  setFull: (v: boolean) => void;
  // 노출(접기) — ←/→ 이동이 꺼진 차트를 건너뛰도록 Dashboard 가 든다
  open: boolean;
  setOpen: (v: boolean) => void;
  // 전체 보기에서 ←/→ — 이전(-1)/다음(+1) 차트로 순환 이동
  onNav: (dir: 1 | -1) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      else if (e.key === 'ArrowRight') onNav(1);
      else if (e.key === 'ArrowLeft') onNav(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, setFull, onNav]);
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
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setFull(true)}
            title="전체 보기 — 화면 풀사이즈"
            className="select-none text-[15px] leading-none text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            ⛶
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={open}
            onClick={() => setOpen(!open)}
            title={open ? '차트 접기' : '차트 펼치기'}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${open ? 'bg-primary' : 'bg-muted'}`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${open ? 'translate-x-[18px]' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </div>
      {open && !full && children}
      {full && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background px-6 py-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-[15px] text-foreground">{title}</h3>
              {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[11px] text-muted-foreground/60">← → 다음 차트</span>
              <button
                type="button"
                onClick={() => setFull(false)}
                title="닫기 (Esc)"
                className="rounded-md border border-border px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                닫기 ✕
              </button>
            </div>
          </div>
          {/* 차트 자체가 뷰포트 높이(chartH)로 그려지므로 여기선 담기만 한다.
              m-auto: 내용이 영역보다 작을 때 중앙 정렬(넘치면 0으로 접혀 스크롤 정상). */}
          <div className="flex min-h-0 flex-1 overflow-auto">
            <div className="m-auto w-full">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
