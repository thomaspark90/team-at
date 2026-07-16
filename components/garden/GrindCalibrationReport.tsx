'use client';

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
import { ROASTS, SHOTS, distributionCurve, shotMean } from '@/lib/grind-calibration-report';
import type { RoastKey } from '@/lib/grind-calibration-report';

// EK43 지점 캘리브레이션 교육용 리포트 — 2026-07-16 측정(다이얼 6.5, 동일 원두 3종 × 3샷 × 2지점).
// 색은 지점에 고정: 양재천=cat-1(파랑), 판교=cat-2(아쿠아). 순환 금지.

const C_YANGJAE = 'var(--chart-cat-1)';
const C_PANGYO = 'var(--chart-cat-2)';
const GRID = 'var(--chart-grid-stroke)';
const AXIS = 'var(--chart-axis-text)';
const axisTick = { fontSize: 11, fill: AXIS };
const TICKS = [200, 300, 450, 650, 950, 1400, 2000];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px]">
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="ta-card bg-background" style={{ flex: 1, minWidth: 180 }}>
      <div className="tabular text-[24px] font-semibold text-foreground">{value}</div>
      <div className="text-[12px] text-muted-foreground" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}

// 배전도 1종의 지점 간 분포 비교 차트 (부피 기준, 3샷 평균 감마 재구성)
function RoastChart({ roast, label }: { roast: RoastKey; label: string }) {
  const data = distributionCurve(roast);
  const my = shotMean(SHOTS.yangjae[roast]);
  const mp = shotMean(SHOTS.pangyo[roast]);
  return (
    <div className="ta-card bg-background min-w-0">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <span className="tabular text-[11px] text-muted-foreground">
          평균 양재천 {Math.round(my)}µm · 판교 {Math.round(mp)}µm ({Math.round(mp - my)}µm)
        </span>
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
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
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="yangjae" name="양재천점" stroke={C_YANGJAE} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="pangyo" name="판교점" stroke={C_PANGYO} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// 배전도별 평균 크기 덤벨 — 두 지점이 얼마나 떨어져 있는지 한눈에
function Dumbbell() {
  const min = 600;
  const max = 1000;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span className="text-[13px] font-medium text-foreground">배전도별 평균 입자 크기 — 같은 다이얼 6.5</span>
      {ROASTS.map((r) => {
        const my = shotMean(SHOTS.yangjae[r.key]);
        const mp = shotMean(SHOTS.pangyo[r.key]);
        return (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="text-[11px] text-muted-foreground">{r.label}</span>
            <div style={{ position: 'relative', height: 22 }}>
              <div style={{ position: 'absolute', top: 10, left: 0, right: 0, height: 2, background: 'var(--chart-grid-stroke)' }} />
              <div style={{ position: 'absolute', top: 10, left: pos(mp), width: `calc(${pos(my)} - ${pos(mp)})`, height: 2, background: 'hsl(var(--muted-foreground))' }} />
              {/* 판교 점 */}
              <div title={`판교 ${Math.round(mp)}µm`} style={{ position: 'absolute', top: 4, left: `calc(${pos(mp)} - 7px)`, width: 14, height: 14, borderRadius: 7, background: C_PANGYO, border: '2px solid hsl(var(--background))' }} />
              {/* 양재천 점 */}
              <div title={`양재천 ${Math.round(my)}µm`} style={{ position: 'absolute', top: 4, left: `calc(${pos(my)} - 7px)`, width: 14, height: 14, borderRadius: 7, background: C_YANGJAE, border: '2px solid hsl(var(--background))' }} />
            </div>
            <div className="tabular text-[11px] text-muted-foreground" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>판교 {Math.round(mp)}µm</span>
              <span>차이 {Math.round(mp - my)}µm</span>
              <span>양재천 {Math.round(my)}µm</span>
            </div>
          </div>
        );
      })}
      <div className="tabular text-[10px] text-muted-foreground" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{min}µm (가늚)</span>
        <span>{max}µm (굵음)</span>
      </div>
    </div>
  );
}

export default function GrindCalibrationReport() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 인트로 */}
      <div className="ta-card bg-background" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="text-[14px] text-foreground" style={{ margin: 0, fontWeight: 500 }}>
          같은 EK43, 같은 다이얼인데 왜 커피가 다를까?
        </p>
        <p className="text-[13px] text-muted-foreground" style={{ margin: 0, lineHeight: 1.7 }}>
          2026-07-16, 두 지점의 EK43을 <strong>같은 원두(배전도 3종)·같은 다이얼 6.5</strong>로 맞추고
          언스페셜티 컴퍼스로 분쇄 입자를 측정했습니다(배전도당 3회 촬영 × 2지점 = 18샷).
          결론: <strong>판교점 EK43은 같은 숫자에서 약 20% 가늘게 갈립니다.</strong> 버 마모·정렬·제로포인트가
          장비마다 달라서 생기는 개체차로, 다이얼 숫자를 그대로 옮기면 안 되는 이유입니다.
        </p>
      </div>

      {/* 핵심 숫자 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat value="-187µm" label="같은 다이얼 6.5에서 판교가 더 가늘게 (915→729µm)" />
        <Stat value="약 -20%" label="판교/양재천 평균 입자 크기 비율 0.80 — 3개 배전도 모두 동일 방향" />
        <Stat value="+1.6~2.1" label="판교에서 굵혀야 할 다이얼(잠정) — 다이얼 8.0 실측 후 확정" />
      </div>

      {/* 분포 비교 차트 3종 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>
          아래 곡선은 컴퍼스의 부피 분포(파란 막대)와 같은 스케일로, 각 지점 3샷의 평균·표준편차로
          재구성한 근사 분포입니다. 오른쪽 = 굵은 입자. <strong>판교(아쿠아)가 배전도와 무관하게 통째로
          왼쪽(가는 쪽)으로 밀려 있는 것</strong>이 이번 측정의 핵심입니다.
        </p>
        {ROASTS.map((r) => (
          <RoastChart key={r.key} roast={r.key} label={r.label} />
        ))}
      </div>

      {/* 덤벨 요약 */}
      <Dumbbell />

      {/* 해석 가이드 */}
      <div className="ta-card bg-background" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="text-[13px] font-medium text-foreground" style={{ margin: 0 }}>이 결과를 매장에서 어떻게 쓰나요?</p>
        <ul className="text-[13px] text-muted-foreground" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>
            <strong>레시피의 다이얼 숫자를 지점 간 그대로 복사하지 마세요.</strong> 양재천 기준 6.5 레시피를
            판교에서 6.5로 갈면 훨씬 가늘어져 과추출(쓴맛·떫은맛) 방향으로 밀립니다.
          </li>
          <li>
            잠정 가이드: <strong>판교에서는 양재천 다이얼보다 +1.6~2.1 굵게.</strong> 정확한 환산표는 판교
            다이얼 8.0 측정으로 기울기를 확정한 뒤 레시피 대시보드에 자동 표시될 예정입니다.
          </li>
          <li>
            배전도가 달라도 <strong>평균 굵기는 거의 같게 갈립니다</strong>(890~929µm). 다이얼을 배전도마다
            바꿀 필요는 없고, 맛 조정은 레시피(비율·시간)로 하는 게 맞습니다.
          </li>
          <li>
            미분(가루)은 지점·원두 상태에 따라 달라질 수 있어 계속 측정으로 추적합니다 — 양재천에선 다크가
            분포 폭이 가장 넓었지만(σ 252 vs 208), 판교에선 재현되지 않아 추가 검증 중입니다.
          </li>
        </ul>
      </div>

      {/* 측정값 표 (접근성 겸 원자료) */}
      <div className="ta-card bg-background min-w-0" style={{ overflowX: 'auto' }}>
        <p className="text-[13px] font-medium text-foreground" style={{ marginTop: 0, marginBottom: 8 }}>
          측정 원자료 — EK43 다이얼 6.5, 샷 = 컴퍼스 촬영 1회
        </p>
        <table className="tabular text-[12px]" style={{ borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr className="text-muted-foreground">
              {['배전도', '샷', '양재천 평균(µm)', '양재천 σ', '판교 평균(µm)', '판교 σ'].map((h) => (
                <th key={h} style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid hsl(var(--border))', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-foreground">
            {ROASTS.flatMap((r) =>
              [0, 1, 2].map((i) => (
                <tr key={`${r.key}${i}`}>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{i === 0 ? r.label.split(' ')[1] : ''}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{i + 1}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{SHOTS.yangjae[r.key][i].mean.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{SHOTS.yangjae[r.key][i].std.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{SHOTS.pangyo[r.key][i].mean.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 10px' }}>{SHOTS.pangyo[r.key][i].std.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="text-[11px] text-muted-foreground" style={{ marginBottom: 0 }}>
          측정: 언스페셜티 컴퍼스(분쇄도 측정용지 + 사진 분석) · 동일 원두 로트 · 카메라 거리/조명 최대한 동일 ·
          판교 낮음 샷1(688.75µm)은 이상치 가능성 있음(제외해도 결론 동일).
        </p>
      </div>
    </div>
  );
}
