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
import { fitDialToMicron, dialToMicron } from '@/lib/grinder-calibration';
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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/garden-grind-measurements', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/garden-grinder-alignments', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([m, a]) => {
        setMeasurements(Array.isArray(m) ? m : []);
        setAlignments(Array.isArray(a) ? a : []);
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
        date: m.createdAt.slice(0, 10),
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

  // 다이얼별 지점 비교 (현행만) — 두 지점 모두 측정된 다이얼의 평균·오프셋
  const dialRows = useMemo(() => {
    const group = (pts: Pt[]) => {
      const map = new Map<number, number[]>();
      for (const p of pts) {
        const key = Math.round(p.dial * 10) / 10;
        map.set(key, [...(map.get(key) ?? []), p.mean]);
      }
      return map;
    };
    const gy = group(points.yangjae.current);
    const gp = group(points.pangyo.current);
    const dials = Array.from(new Set([...Array.from(gy.keys()), ...Array.from(gp.keys())])).sort((a, b) => a - b);
    return dials.map((d) => {
      const ys = gy.get(d);
      const ps = gp.get(d);
      const avg = (v?: number[]) => (v && v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
      const my = avg(ys);
      const mp = avg(ps);
      return { dial: d, yangjae: my, ny: ys?.length ?? 0, pangyo: mp, np: ps?.length ?? 0, offset: my != null && mp != null ? mp - my : null };
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 요약 통계 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {STORES.map((s) => {
          const fit = fits[s.id];
          const last = latestAlignmentDate(alignments, s.id);
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
            다이얼별 지점 비교 — 현행 측정 평균
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
              {dialRows.map((r) => (
                <tr key={r.dial}>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{r.dial.toFixed(1)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{r.yangjae != null ? `${Math.round(r.yangjae)} (${r.ny}샷)` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{r.pangyo != null ? `${Math.round(r.pangyo)} (${r.np}샷)` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{r.offset != null ? `${r.offset > 0 ? '+' : ''}${Math.round(r.offset)}` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }} className={r.offset == null ? 'text-muted-foreground' : ''}>
                    {r.offset == null ? '한쪽만 측정' : Math.abs(r.offset) <= DRIFT_TOLERANCE_UM ? '일치' : '불일치'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground" style={{ marginBottom: 0 }}>
            판정 기준: 샷 간 반복성(±{DRIFT_TOLERANCE_UM}µm) 이내면 일치. 얼라인 이전 측정은 제외.
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
