'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrindMeasurement } from '@/lib/grind-measurements';
import { fetchGrindMeasurements } from '@/lib/garden/measurements-cache';
import type { AlignmentEvent } from '@/lib/grinder-alignments';
import { isPostAlignment, latestAlignmentDate } from '@/lib/grinder-alignments';
import type { GrinderProfiles, LatestAlignments } from '@/lib/grinder-calibration';
import { REPEATABILITY_TOLERANCE_UM, pangyoDialText } from '@/lib/grinder-calibration';
import { curveFromShots } from '@/lib/grind-calibration-report';
import type { Shot } from '@/lib/grind-calibration-report';

// 현행 캘리브레이션 리포트 — 최근 얼라인 이후 측정만 모아 지점 비교를 자동 갱신한다.
// 2026-07-16 기준선 리포트(GrindCalibrationReport)는 아카이브로 아래에 남는다.
// 색은 지점에 고정: 양재천=cat-1, 판교=cat-2 (아카이브 리포트와 동일 규칙).

const C_YANGJAE = 'var(--chart-cat-1)';
const C_PANGYO = 'var(--chart-cat-2)';
const GRID = 'var(--chart-grid-stroke)';
const AXIS = 'var(--chart-axis-text)';
const axisTick = { fontSize: 12, fill: AXIS };
const TICKS = [200, 300, 450, 650, 950, 1400, 2000];

const dialKey = (dial: number) => (Math.round(dial * 10) / 10).toFixed(1);

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px]">
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

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-md bg-muted/40 p-6" style={{ flex: 1, minWidth: 220 }}>
      <div
        className="tabular text-[22px] font-medium"
        style={{ color: tone === 'warn' ? 'hsl(0 72% 45%)' : 'hsl(var(--foreground))' }}
      >
        {value}
      </div>
      <div className="text-[13px] text-muted-foreground" style={{ marginTop: 6 }}>{label}</div>
    </div>
  );
}

interface DialGroup {
  dial: string; // '6.0'
  yangjae: Shot[];
  pangyo: Shot[];
}

export default function GrindCalibrationReportLive() {
  const [measurements, setMeasurements] = useState<GrindMeasurement[] | null>(null);
  const [alignments, setAlignments] = useState<AlignmentEvent[]>([]);
  const [profiles, setProfiles] = useState<GrinderProfiles>({});

  useEffect(() => {
    fetchGrindMeasurements().then(setMeasurements);
    fetch('/api/garden-grinder-alignments', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAlignments(Array.isArray(d) ? d : []));
    fetch('/api/garden-grinders', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => setProfiles(d && typeof d === 'object' ? d : {}));
  }, []);

  // 현행(각 지점 최근 얼라인 이후) 측정 중 평균 µm가 입력된 것만
  const current = useMemo(
    () =>
      (measurements ?? []).filter(
        (m) => m.mean != null && isPostAlignment(alignments, m.store, m.createdAt)
      ),
    [measurements, alignments]
  );

  // 다이얼별 지점 샷 묶음 — 곡선은 σ 있는 샷만, 평균은 전부
  const groups = useMemo(() => {
    const map = new Map<string, DialGroup>();
    for (const m of current) {
      const k = dialKey(m.dial);
      if (!map.has(k)) map.set(k, { dial: k, yangjae: [], pangyo: [] });
      map.get(k)![m.store === 'yangjae' ? 'yangjae' : 'pangyo'].push({
        mean: m.mean!,
        std: m.std ?? 0,
      });
    }
    return Array.from(map.values()).sort((a, b) => Number(a.dial) - Number(b.dial));
  }, [current]);

  const shared = groups.filter((g) => g.yangjae.length > 0 && g.pangyo.length > 0);
  const avg = (shots: Shot[]) => shots.reduce((s, x) => s + x.mean, 0) / shots.length;
  const offsets = shared.map((g) => avg(g.pangyo) - avg(g.yangjae));
  const meanOffset = offsets.length ? offsets.reduce((s, x) => s + x, 0) / offsets.length : null;
  const aligned = meanOffset != null && Math.abs(meanOffset) <= REPEATABILITY_TOLERANCE_UM;

  const latestAligns: LatestAlignments = {
    yangjae: latestAlignmentDate(alignments, 'yangjae'),
    pangyo: latestAlignmentDate(alignments, 'pangyo'),
  };
  const conv = pangyoDialText(profiles, 6.5, latestAligns);

  if (measurements === null) {
    return <p className="text-[13px] text-muted-foreground">현행 측정 불러오는 중…</p>;
  }

  const storeShots = (id: StoreId) => current.filter((m) => m.store === id).length;
  const missing = STORES.filter((s) => storeShots(s.id) === 0);

  return (
    // 카드 해체(2026-08-08) — 주요 섹션 경계는 가로 구분선으로만
    <div className="divide-y divide-border">
      {/* 현행 상태 요약 */}
      <div className="pb-[54px]" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat
          value={meanOffset != null ? `${meanOffset > 0 ? '+' : ''}${Math.round(meanOffset)}µm` : '—'}
          label={
            meanOffset != null
              ? `공통 다이얼 ${shared.length}개 평균 오프셋 (판교 − 양재천)`
              : '두 지점이 같은 다이얼로 측정한 현행 데이터가 아직 없어요'
          }
        />
        <Stat
          value={meanOffset == null ? '측정 대기' : aligned ? '얼라인 일치' : '메쉬 맞춤 필요'}
          tone={meanOffset == null ? undefined : aligned ? 'ok' : 'warn'}
          label={`판정 기준: 샷 간 반복성 ±${REPEATABILITY_TOLERANCE_UM}µm 이내면 두 지점 일치`}
        />
        <Stat
          value={conv ? (conv.stale ? '재측정 필요' : `6.5 → ${conv.text}`) : '—'}
          tone={conv?.stale ? 'warn' : undefined}
          label={
            conv?.provisional
              ? '양재천 6.5 기준 판교 다이얼 (잠정 — 측정점 피팅 확보 전)'
              : '양재천 6.5 기준 판교 다이얼 (측정 피팅 확정값)'
          }
        />
      </div>

      {/* 데이터 없는 지점 안내 */}
      {missing.length > 0 && (
        <p className="py-[54px] text-[13px] text-muted-foreground" style={{ margin: 0 }}>
          {missing.map((s) => s.label).join(' · ')}
          {missing.length === 1 ? '은(는)' : '은'} 최근 얼라인 이후 측정이 아직 없어요 — 프로토콜(다이얼
          6·8·10 × 각 3샷) 측정을 올리면 이 리포트가 자동으로 채워집니다. (얼라인:{' '}
          {STORES.map((s) => `${s.short} ${latestAligns[s.id] ?? '기록 없음'}`).join(' · ')})
        </p>
      )}

      {/* 공통 다이얼별 분포 비교 */}
      {shared.length > 0 && (
        <div className="py-[54px]" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>
          {shared.map((g) => {
            const curveShots = {
              yangjae: g.yangjae.filter((s: Shot) => s.std > 0),
              pangyo: g.pangyo.filter((s: Shot) => s.std > 0),
            };
            const data = curveFromShots(curveShots);
            const my = avg(g.yangjae);
            const mp = avg(g.pangyo);
            return (
              <div key={g.dial} className="min-w-0 rounded-md bg-muted/40 p-6">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span className="text-[15px] font-medium text-foreground">다이얼 {g.dial}</span>
                  <span className="tabular text-[11px] text-muted-foreground">
                    양재천 {Math.round(my)}µm({g.yangjae.length}샷) · 판교 {Math.round(mp)}µm(
                    {g.pangyo.length}샷) · Δ{Math.round(mp - my)}µm
                  </span>
                </div>
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis
                        dataKey="x"
                        type="number"
                        scale="log"
                        domain={[200, 2000]}
                        ticks={TICKS}
                        tick={axisTick}
                        stroke={AXIS}
                        tickFormatter={(v) => `${v}`}
                      />
                      <YAxis tick={axisTick} stroke={AXIS} tickFormatter={(v) => `${v}%`} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Line type="monotone" dataKey="yangjae" name="양재천점" stroke={C_YANGJAE} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="pangyo" name="판교점" stroke={C_PANGYO} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 현행 원자료 */}
      {current.length > 0 && (
        <div className="min-w-0 pt-[54px]" style={{ overflowX: 'auto' }}>
          <p className="text-[15px] font-medium text-foreground" style={{ marginTop: 0, marginBottom: 10 }}>
            현행 측정 원자료 — 최근 얼라인 이후 {current.length}샷
          </p>
          <table className="tabular text-[13px]" style={{ borderCollapse: 'collapse', minWidth: 620, width: '100%', maxWidth: 860 }}>
            <thead>
              <tr className="text-muted-foreground">
                {['날짜', '지점', '원두', '다이얼', '평균(µm)', 'σ'].map((h) => (
                  <th key={h} className="font-medium" style={{ textAlign: h === '원두' ? 'left' : 'right', padding: '4px 10px', borderBottom: '1px solid hsl(var(--border))' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-foreground">
              {current
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((m) => (
                  <tr key={m.id}>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }}>{m.createdAt.slice(0, 10)}</td>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }}>
                      {STORES.find((s) => s.id === m.store)?.short ?? m.store}
                    </td>
                    <td style={{ textAlign: 'left', padding: '3px 10px' }}>{m.bean}</td>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }}>{m.dial.toFixed(1)}</td>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }}>{m.mean!.toFixed(1)}</td>
                    <td style={{ textAlign: 'right', padding: '3px 10px' }}>{m.std != null ? m.std.toFixed(1) : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
