'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrindMeasurement } from '@/lib/grind-measurements';
import type { AlignmentEvent } from '@/lib/grinder-alignments';
import { isPostAlignment, latestAlignmentDate } from '@/lib/grinder-alignments';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { fitDialToMicron, dialToMicron, calibrationReady } from '@/lib/grinder-calibration';
import { DRIFT_TOLERANCE_UM } from '@/lib/calibration-checks';
import type { Shot } from '@/lib/grind-calibration-report';
import {
  BASELINE_DATE_20260716,
  BASELINE_DIAL_20260716,
  baselineShots,
  curveFromShots,
} from '@/lib/grind-calibration-report';

// 캘리브레이션 시각화 — 업로드된 측정 + 2026-07-16 기준선을 다이얼→µm 평면에 그린다.
// 색은 지점 고정: 양재천=cat-1(파랑), 판교=cat-2(아쿠아). 각 지점의 최근 얼라인먼트
// 날짜 이전 측정은 흐리게(얼라인 이전) 표시하고 피팅·비교에서 제외한다.

const C: Record<StoreId, string> = { yangjae: 'var(--chart-cat-1)', pangyo: 'var(--chart-cat-2)' };
const GRID = 'var(--chart-grid-stroke)';
const AXIS = 'var(--chart-axis-text)';
const axisTick = { fontSize: 12, fill: AXIS };

interface Pt {
  dial: number;
  mean: number;
  std?: number;
  date: string; // YYYY-MM-DD
  label: string; // 원두명 또는 기준선 표기
}

type StorePoints = Record<StoreId, { current: Pt[]; stale: Pt[] }>;

const storeLabel = (id: StoreId) => STORES.find((s) => s.id === id)?.label ?? id;

function ScatterTip({ active, payload }: any) {
  const p: (Pt & { store?: string; stale?: boolean }) | undefined = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]">
      <div className="text-muted-foreground">
        {p.label} · {p.date}
        {p.stale ? ' · 얼라인 이전' : ''}
      </div>
      <div className="tabular text-foreground">
        다이얼 {p.dial.toFixed(1)} → {Math.round(p.mean)}µm{p.std ? ` (σ ${Math.round(p.std)})` : ''}
      </div>
    </div>
  );
}

function CurveTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]">
      <div className="mb-1 text-muted-foreground">{Number(label).toLocaleString()}µm 부근</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 tabular text-foreground">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.stroke }} aria-hidden />
            {p.name}
          </span>
          <span>{Number(p.value).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function GrindCalibrationCharts() {
  const [measurements, setMeasurements] = useState<GrindMeasurement[]>([]);
  const [alignments, setAlignments] = useState<AlignmentEvent[]>([]);
  const [profiles, setProfiles] = useState<GrinderProfiles>({});
  const [applying, setApplying] = useState<StoreId | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/garden-grind-measurements', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/garden-grinder-alignments', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/garden-grinders', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([m, a, p]) => {
        setMeasurements(Array.isArray(m) ? m : []);
        setAlignments(Array.isArray(a) ? a : []);
        if (p && typeof p === 'object') setProfiles(p as GrinderProfiles);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 기준선(07-16) + 업로드 측정을 지점별 현행/얼라인 이전으로 분류
  const points = useMemo<StorePoints>(() => {
    const out: StorePoints = { yangjae: { current: [], stale: [] }, pangyo: { current: [], stale: [] } };
    for (const s of STORES) {
      const bucket = isPostAlignment(alignments, s.id, BASELINE_DATE_20260716) ? 'current' : 'stale';
      for (const sh of baselineShots(s.id)) {
        out[s.id][bucket].push({
          dial: BASELINE_DIAL_20260716,
          mean: sh.mean,
          std: sh.std,
          date: BASELINE_DATE_20260716,
          label: '기준선 측정 (배전도 3종)',
        });
      }
    }
    for (const m of measurements) {
      if (m.mean == null || !Number.isFinite(m.mean)) continue;
      const bucket = isPostAlignment(alignments, m.store, m.createdAt) ? 'current' : 'stale';
      out[m.store][bucket].push({
        dial: m.dial,
        mean: m.mean,
        std: m.std,
        // 업로드 화면의 날짜 그룹과 같은 KST 기준 — UTC 로 자르면 오전 9시 이전 측정이 전날로 표시된다
        date: new Date(new Date(m.createdAt).getTime() + 9 * 3600_000).toISOString().slice(0, 10),
        label: m.bean,
      });
    }
    return out;
  }, [measurements, alignments]);

  // 지점별 다이얼→µm 선형 피팅 (현행 데이터만, 서로 다른 다이얼 2점 이상 필요)
  const fits = useMemo(
    () => ({
      yangjae: fitDialToMicron(points.yangjae.current.map((p) => ({ dial: p.dial, micron: p.mean }))),
      pangyo: fitDialToMicron(points.pangyo.current.map((p) => ({ dial: p.dial, micron: p.mean }))),
    }),
    [points]
  );

  const allPts = [...points.yangjae.current, ...points.yangjae.stale, ...points.pangyo.current, ...points.pangyo.stale];
  const dialMin = allPts.length ? Math.min(...allPts.map((p) => p.dial)) : 6;
  const dialMax = allPts.length ? Math.max(...allPts.map((p) => p.dial)) : 10;
  const x0 = Math.floor((dialMin - 0.5) * 2) / 2;
  const x1 = Math.ceil((dialMax + 0.5) * 2) / 2;

  // 다이얼별 지점 비교 — 현행 평균이 기본, 현행이 없는 쪽은 얼라인 이전 평균을 참고용으로 채운다.
  // 판정·평균 오프셋(offset)은 현행 대 현행일 때만, 참고 오프셋(refOffset)은 얼라인 이전이 섞인 경우.
  const dialRows = useMemo(() => {
    const group = (pts: Pt[]) => {
      const map = new Map<number, Pt[]>();
      for (const p of pts) {
        const key = Math.round(p.dial * 10) / 10;
        map.set(key, [...(map.get(key) ?? []), p]);
      }
      return map;
    };
    const gy = group(points.yangjae.current);
    const gp = group(points.pangyo.current);
    const gys = group(points.yangjae.stale);
    const gps = group(points.pangyo.stale);
    const dials = Array.from(
      new Set([...Array.from(gy.keys()), ...Array.from(gp.keys()), ...Array.from(gys.keys()), ...Array.from(gps.keys())])
    ).sort((a, b) => a - b);
    const avg = (v?: Pt[]) => (v && v.length ? v.reduce((s, p) => s + p.mean, 0) / v.length : null);
    // 그룹의 측정 날짜 표기 — 하루면 MM.DD, 여러 날이면 MM.DD~MM.DD
    const dateSpan = (v?: Pt[]) => {
      if (!v || !v.length) return null;
      const ds = Array.from(new Set(v.map((p) => p.date))).sort();
      const fmt = (d: string) => d.slice(5).replace('-', '.');
      return ds.length === 1 ? fmt(ds[0]) : `${fmt(ds[0])}~${fmt(ds[ds.length - 1])}`;
    };
    return dials.map((d) => {
      const my = avg(gy.get(d));
      const mp = avg(gp.get(d));
      const mys = avg(gys.get(d));
      const mps = avg(gps.get(d));
      const offset = my != null && mp != null ? mp - my : null;
      const ery = my ?? mys;
      const erp = mp ?? mps;
      return {
        dial: d,
        yangjae: my,
        ny: gy.get(d)?.length ?? 0,
        yDate: dateSpan(gy.get(d)),
        yStale: mys,
        nyStale: gys.get(d)?.length ?? 0,
        yStaleDate: dateSpan(gys.get(d)),
        pangyo: mp,
        np: gp.get(d)?.length ?? 0,
        pDate: dateSpan(gp.get(d)),
        pStale: mps,
        npStale: gps.get(d)?.length ?? 0,
        pStaleDate: dateSpan(gps.get(d)),
        offset,
        refOffset: offset == null && ery != null && erp != null ? erp - ery : null,
      };
    });
  }, [points]);

  const compared = dialRows.filter((r) => r.offset != null);
  const meanOffset = compared.length ? compared.reduce((s, r) => s + (r.offset as number), 0) / compared.length : null;

  // 다이얼별 분포 비교 — 두 지점 모두 현행 σ 포함 샷이 있는 다이얼만
  const distCharts = useMemo(() => {
    const shotsAt = (pts: Pt[], dial: number): Shot[] =>
      pts.filter((p) => Math.round(p.dial * 10) / 10 === dial && p.std != null).map((p) => ({ mean: p.mean, std: p.std as number }));
    return dialRows
      .map((r) => {
        const sy = shotsAt(points.yangjae.current, r.dial);
        const sp = shotsAt(points.pangyo.current, r.dial);
        if (!sy.length || !sp.length) return null;
        return { dial: r.dial, data: curveFromShots({ yangjae: sy, pangyo: sp }) };
      })
      .filter(Boolean) as { dial: number; data: Array<Record<string, number>> }[];
  }, [dialRows, points]);

  const hasStale = points.yangjae.stale.length > 0 || points.pangyo.stale.length > 0;

  // 현행 측정점을 지점 그라인더 프로필로 승격 — 레시피 페이지의 다이얼 환산(convertDial)이
  // 잠정 오프셋 범위 대신 이 실측 피팅을 쓰게 된다
  const applyFit = async (id: StoreId) => {
    const pts = points[id].current.map((p) => ({ dial: p.dial, micron: Math.round(p.mean) }));
    if (pts.length < 2 || applying) return;
    // 이 저장은 해당 지점의 측정점 세트를 통째로 교체한다 — 대시보드에서 손으로 넣은 값이 있으면 사라진다
    const had = profiles[id]?.points?.length ?? 0;
    const warn = had
      ? `${storeLabel(id)}에 저장된 측정점 ${had}개가 현행 측정 ${pts.length}개로 교체됩니다. 계속할까요?`
      : `${storeLabel(id)}의 현행 측정 ${pts.length}개를 레시피 환산에 적용할까요?`;
    if (!window.confirm(warn)) return;
    setApplying(id);
    try {
      const res = await fetch('/api/garden-grinders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: id, points: pts }),
      });
      if (res.ok) {
        const p = await res.json();
        if (p && typeof p === 'object') setProfiles(p as GrinderProfiles);
      }
    } finally {
      setApplying(null);
    }
  };

  const bothApplied = calibrationReady(profiles, 'yangjae', 'pangyo');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 요약 통계 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {STORES.map((s) => {
          const fit = fits[s.id];
          const last = latestAlignmentDate(alignments, s.id);
          const profile = profiles[s.id];
          const profileFit = fitDialToMicron(profile?.points);
          // 프로필이 현행 피팅과 사실상 같으면(기울기·다이얼8 환산 1µm 이내) 이미 적용된 상태
          const upToDate =
            !!fit && !!profileFit &&
            Math.abs(fit.a - profileFit.a) < 1 &&
            Math.abs(dialToMicron(fit, 8) - dialToMicron(profileFit, 8)) < 1;
          return (
            <div key={s.id} className="ta-card bg-background" style={{ flex: 1, minWidth: 220 }}>
              <div className="text-[11px] text-muted-foreground" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: C[s.id] }} aria-hidden />
                {s.label} · 얼라인 {last ?? '기록 없음'}
              </div>
              <div className="tabular text-[22px] text-foreground" style={{ marginTop: 4 }}>
                {fit ? `${Math.round(fit.a)}µm/다이얼` : '기울기 미확정'}
              </div>
              <div className="text-[11px] text-muted-foreground" style={{ marginTop: 2 }}>
                {fit
                  ? `현행 측정 ${points[s.id].current.length}샷 피팅 · 다이얼 8 ≈ ${Math.round(dialToMicron(fit, 8))}µm`
                  : `서로 다른 다이얼 2개 이상 측정 필요 (현행 ${points[s.id].current.length}샷)`}
              </div>
              {fit && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {upToDate ? (
                    <span className="tabular text-[11px]" style={{ color: 'hsl(150 60% 35%)' }}>
                      레시피 환산에 적용됨{profile?.updatedAt ? ` · ${profile.updatedAt.slice(5, 10).replace('-', '.')}` : ''}
                    </span>
                  ) : (
                    <button
                      onClick={() => applyFit(s.id)}
                      disabled={applying != null}
                      className="ta-btn"
                      style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
                    >
                      {applying === s.id ? '적용 중…' : profileFit ? '이 피팅으로 환산 갱신' : '레시피 환산에 적용'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="ta-card bg-background" style={{ flex: 1, minWidth: 220 }}>
          <div className="text-[11px] text-muted-foreground">두 지점 오프셋 (같은 다이얼, 판교−양재천)</div>
          <div className="tabular text-[22px] text-foreground" style={{ marginTop: 4 }}>
            {meanOffset != null ? `${meanOffset > 0 ? '+' : ''}${Math.round(meanOffset)}µm` : '—'}
          </div>
          <div className="text-[11px] text-muted-foreground" style={{ marginTop: 2 }}>
            {meanOffset != null
              ? Math.abs(meanOffset) <= DRIFT_TOLERANCE_UM
                ? `±${DRIFT_TOLERANCE_UM}µm 이내 — 두 지점 얼라인 일치`
                : `±${DRIFT_TOLERANCE_UM}µm 초과 — 다이얼 환산 필요`
              : '두 지점이 같은 다이얼을 측정하면 계산됩니다'}
          </div>
          {bothApplied && (
            <div className="tabular text-[11px]" style={{ marginTop: 8, color: 'hsl(150 60% 35%)' }}>
              두 지점 환산 적용됨 — 레시피의 판교 다이얼이 실측 확정값으로 표시됩니다
            </div>
          )}
        </div>
      </div>

      {/* 다이얼 → µm 산점도 + 피팅 */}
      <div className="ta-card bg-background min-w-0">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="text-[15px] font-medium text-foreground">다이얼 → 입자 크기 — 측정 전체</span>
          <button onClick={refresh} className="text-[11px] text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>
        <p className="text-[13px] text-muted-foreground" style={{ marginTop: 4, marginBottom: 8, maxWidth: 880 }}>
          점 1개 = 컴퍼스 촬영 1샷. 진한 점은 각 지점의 최근 얼라인먼트 이후(현행) 측정,{' '}
          {hasStale ? '흐린 점은 얼라인 이전 측정(피팅·비교 제외)' : '얼라인 이전 측정은 흐리게 표시'}입니다. 직선은 현행 측정의
          다이얼→µm 선형 피팅 — 두 지점 직선이 겹칠수록 얼라인이 일치합니다.
        </p>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis type="number" dataKey="dial" name="다이얼" domain={[x0, x1]} tick={axisTick} stroke={AXIS} tickCount={Math.round((x1 - x0) * 2) + 1} />
              <YAxis type="number" dataKey="mean" name="평균 µm" domain={['dataMin - 60', 'dataMax + 60']} tick={axisTick} stroke={AXIS} tickFormatter={(v) => `${Math.round(v)}`} />
              <Tooltip content={<ScatterTip />} cursor={{ strokeDasharray: '3 3' }} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              {(['yangjae', 'pangyo'] as StoreId[]).map((id) =>
                fits[id] ? (
                  <ReferenceLine
                    key={`fit-${id}`}
                    segment={[
                      { x: x0, y: dialToMicron(fits[id]!, x0) },
                      { x: x1, y: dialToMicron(fits[id]!, x1) },
                    ]}
                    stroke={C[id]}
                    strokeWidth={2}
                    ifOverflow="hidden"
                  />
                ) : null
              )}
              {points.yangjae.current.length > 0 && <Scatter name="양재천점" data={points.yangjae.current} fill={C.yangjae} />}
              {points.pangyo.current.length > 0 && <Scatter name="판교점" data={points.pangyo.current} fill={C.pangyo} />}
              {points.yangjae.stale.length > 0 && (
                <Scatter name="양재천 (얼라인 이전)" data={points.yangjae.stale.map((p) => ({ ...p, stale: true }))} fill={C.yangjae} opacity={0.25} />
              )}
              {points.pangyo.stale.length > 0 && (
                <Scatter name="판교 (얼라인 이전)" data={points.pangyo.stale.map((p) => ({ ...p, stale: true }))} fill={C.pangyo} opacity={0.25} />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 다이얼별 비교 표 */}
      {dialRows.length > 0 && (
        <div className="ta-card bg-background min-w-0" style={{ overflowX: 'auto' }}>
          <p className="text-[15px] font-medium text-foreground" style={{ marginTop: 0, marginBottom: 10 }}>
            다이얼별 지점 비교
          </p>
          <table className="tabular text-[13px]" style={{ borderCollapse: 'collapse', minWidth: 480, width: '100%', maxWidth: 680 }}>
            <thead>
              <tr className="text-muted-foreground">
                {['다이얼', '양재천 평균(µm)', '판교 평균(µm)', '오프셋(판교−양재천)', '판정'].map((h) => (
                  <th key={h} style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid hsl(var(--border))', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-foreground">
              {dialRows.map((r) => {
                const cell = (mean: number | null, n: number, date: string | null, stale: number | null, nStale: number, staleDate: string | null) =>
                  mean != null ? (
                    `${Math.round(mean)} (${n}샷 · ${date})`
                  ) : stale != null ? (
                    <span className="text-muted-foreground">{Math.round(stale)} ({nStale}샷 · {staleDate} · 얼라인 전)</span>
                  ) : (
                    '—'
                  );
                return (
                  <tr key={r.dial}>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }}>{r.dial.toFixed(1)}</td>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }}>{cell(r.yangjae, r.ny, r.yDate, r.yStale, r.nyStale, r.yStaleDate)}</td>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }}>{cell(r.pangyo, r.np, r.pDate, r.pStale, r.npStale, r.pStaleDate)}</td>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }} className={r.offset == null ? 'text-muted-foreground' : ''}>
                      {r.offset != null
                        ? `${r.offset > 0 ? '+' : ''}${Math.round(r.offset)}`
                        : r.refOffset != null
                          ? `${r.refOffset > 0 ? '+' : ''}${Math.round(r.refOffset)} (참고)`
                          : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }} className={r.offset == null ? 'text-muted-foreground' : ''}>
                      {r.offset != null
                        ? Math.abs(r.offset) <= DRIFT_TOLERANCE_UM
                          ? '일치'
                          : '불일치'
                        : r.refOffset != null
                          ? '얼라인 전 비교 — 참고용'
                          : '한쪽만 측정'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground" style={{ marginBottom: 0 }}>
            판정 기준: 샷 간 반복성(±{DRIFT_TOLERANCE_UM}µm) 이내면 일치 — 현행(최근 얼라인 이후) 측정끼리만 판정.
            현행이 없는 쪽은 얼라인 전 평균을 흐리게 참고용으로 표시하며 판정·평균 오프셋 계산에선 제외.
          </p>
        </div>
      )}

      {/* 다이얼별 분포 비교 (σ가 있는 현행 측정이 두 지점 모두 있을 때) */}
      {distCharts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>
          {distCharts.map(({ dial, data }) => (
            <div key={dial} className="ta-card bg-background min-w-0">
              <span className="text-[13px] font-medium text-foreground">다이얼 {dial.toFixed(1)} 분포 비교</span>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="x" type="number" scale="log" domain={[200, 2000]} ticks={[200, 300, 450, 650, 950, 1400, 2000]} tick={axisTick} stroke={AXIS} tickFormatter={(v) => `${v}`} />
                    <YAxis tick={axisTick} stroke={AXIS} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<CurveTip />} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Line type="monotone" dataKey="yangjae" name="양재천점" stroke={C.yangjae} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="pangyo" name="판교점" stroke={C.pangyo} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
