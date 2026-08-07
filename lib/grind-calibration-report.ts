// 2026-07-16 EK43 지점 캘리브레이션 측정 결과 — 교육용 리포트 데이터.
// 원본: 언스페셜티 컴퍼스 측정(사진 1장=1샷), docs/garden-grind-calibration-log.md 참조.
// 분포 곡선은 샷별 (평균, 표준편차)로 감마분포를 재구성한 근사 — 컴퍼스 부피 분포(파란
// 막대)와 같은 스케일(로그 구간당 부피 %)로 그린다. 미분 봉우리는 "개수" 기준이라
// 부피 곡선에는 거의 안 보이는 게 정상.
import type { StoreId } from './types';

export type RoastKey = 'low' | 'medium' | 'high';

export const ROASTS: { key: RoastKey; label: string }[] = [
  { key: 'low', label: '배전도 낮음 (라이트)' },
  { key: 'medium', label: '배전도 중간 (미디엄)' },
  { key: 'high', label: '배전도 강함 (다크)' },
];

export interface Shot {
  mean: number; // 평균 입자 µm
  std: number; // 분포 표준편차 µm
}

// 다이얼 6.5 고정, 원두 동일 로트, 지점만 다름
export const SHOTS: Record<StoreId, Record<RoastKey, Shot[]>> = {
  yangjae: {
    low: [
      { mean: 920.57, std: 211.77 },
      { mean: 929.23, std: 200.66 },
      { mean: 936.7, std: 212.46 },
    ],
    medium: [
      { mean: 873.29, std: 210.3 },
      { mean: 902.24, std: 168.57 },
      { mean: 894.12, std: 213.55 },
    ],
    high: [
      { mean: 943.68, std: 259.2 },
      { mean: 916.38, std: 247.08 },
      { mean: 919.96, std: 249.73 },
    ],
  },
  pangyo: {
    low: [
      { mean: 688.75, std: 227.94 },
      { mean: 783.22, std: 202.89 },
      { mean: 807.52, std: 193.85 },
    ],
    medium: [
      { mean: 734.45, std: 230.16 },
      { mean: 740.06, std: 222.66 },
      { mean: 711.39, std: 229.67 },
    ],
    high: [
      { mean: 673.24, std: 207.79 },
      { mean: 682.23, std: 207.09 },
      { mean: 735.96, std: 210.52 },
    ],
  },
};

export const shotMean = (shots: Shot[]) => shots.reduce((s, x) => s + x.mean, 0) / shots.length;

// Lanczos 근사 log-gamma (g=7)
const LG = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LG.length; i++) x += LG[i] / (z + i + 1);
  const t = z + LG.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// 감마 pdf — shape k=(m/s)², scale θ=s²/m
function gammaPdf(x: number, mean: number, std: number): number {
  const k = (mean / std) ** 2;
  const theta = (std * std) / mean;
  const logp = (k - 1) * Math.log(x) - x / theta - lgamma(k) - k * Math.log(theta);
  return Math.exp(logp);
}

// 컴퍼스 축과 동일한 로그 구간(인접 구간비 ≈1.106) 기준 "구간당 부피 %"
const BIN_RATIO = 1.106;

export interface CurvePoint {
  x: number; // 입자 크기 µm
  yangjae: number;
  pangyo: number;
}

// --- 2026-07-16 기준선을 캘리브레이션 차트에서 재사용하기 위한 내보내기 ---
export const BASELINE_DATE_20260716 = '2026-07-16';
export const BASELINE_DIAL_20260716 = 6.5;

// 지점별 9샷(배전도 3종 × 3샷) 평탄화 — 다이얼 6.5 고정
export function baselineShots(store: StoreId): Shot[] {
  return ROASTS.flatMap((r) => SHOTS[store][r.key]);
}

// 임의 샷 집합들의 로그 격자 부피 분포 곡선 (컴퍼스와 같은 스케일) — 지점 간 시각 비교용
export function curveFromShots(
  series: Record<string, Shot[]>,
  points = 48,
  xMin = 200,
  xMax = 2000
): Array<Record<string, number>> {
  const step = Math.pow(xMax / xMin, 1 / (points - 1));
  const out: Array<Record<string, number>> = [];
  for (let i = 0; i < points; i++) {
    const x = xMin * Math.pow(step, i);
    const row: Record<string, number> = { x: Math.round(x) };
    for (const [key, shots] of Object.entries(series)) {
      if (!shots.length) continue;
      const pdf = shots.reduce((s, sh) => s + gammaPdf(x, sh.mean, sh.std), 0) / shots.length;
      row[key] = Math.round(pdf * x * Math.log(BIN_RATIO) * 100 * 100) / 100;
    }
    out.push(row);
  }
  return out;
}

// 200~2000µm 로그 격자에서 지점별(3샷 평균) 분포 곡선 생성
export function distributionCurve(roast: RoastKey, points = 48): CurvePoint[] {
  const xMin = 200;
  const xMax = 2000;
  const step = Math.pow(xMax / xMin, 1 / (points - 1));
  const out: CurvePoint[] = [];
  const massAt = (store: StoreId, x: number) => {
    const shots = SHOTS[store][roast];
    const pdf = shots.reduce((s, sh) => s + gammaPdf(x, sh.mean, sh.std), 0) / shots.length;
    return pdf * x * Math.log(BIN_RATIO) * 100; // 로그 구간 질량 → %
  };
  for (let i = 0; i < points; i++) {
    const x = xMin * Math.pow(step, i);
    out.push({
      x: Math.round(x),
      yangjae: Math.round(massAt('yangjae', x) * 100) / 100,
      pangyo: Math.round(massAt('pangyo', x) * 100) / 100,
    });
  }
  return out;
}
