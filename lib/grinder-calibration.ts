// 지점 간 그라인더 캘리브레이션 — 두 EK43은 개체차(버 마모·정렬·제로포인트)로
// 같은 다이얼에서 다른 입자 크기가 나온다. 언스페셜티 컴퍼스로 측정한
// (다이얼, 평균 입자 µm) 점들을 지점별로 저장하고, 다이얼→µm 선형 피팅을 거쳐
// "양재천 6.5 ↔ 판교 X.X"를 환산한다.
import type { StoreId } from './types';

export interface GrindPoint {
  dial: number; // EK43 다이얼 (0.1 단위)
  micron: number; // 평균 입자 크기 µm (컴퍼스 측정값)
}

export interface GrinderProfile {
  points: GrindPoint[];
  updatedAt?: string;
  updatedBy?: string;
}

export type GrinderProfiles = Partial<Record<StoreId, GrinderProfile>>;

export interface LinearFit {
  a: number; // 기울기 (µm / 다이얼 1.0)
  b: number; // 절편
}

// 최소제곱 선형 피팅 dial→µm — 서로 다른 다이얼 2점 이상 필요
export function fitDialToMicron(points: GrindPoint[] | undefined): LinearFit | null {
  const pts = (points ?? []).filter((p) => Number.isFinite(p.dial) && Number.isFinite(p.micron));
  if (pts.length < 2) return null;
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.dial, 0);
  const sy = pts.reduce((s, p) => s + p.micron, 0);
  const sxx = pts.reduce((s, p) => s + p.dial * p.dial, 0);
  const sxy = pts.reduce((s, p) => s + p.dial * p.micron, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null; // 다이얼이 전부 같은 값
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  if (!Number.isFinite(a) || Math.abs(a) < 1e-9) return null; // 역변환 불가
  return { a, b };
}

export const dialToMicron = (fit: LinearFit, dial: number) => fit.a * dial + fit.b;
export const micronToDial = (fit: LinearFit, micron: number) => (micron - fit.b) / fit.a;

// from 지점 다이얼 → 같은 입자 크기가 나오는 to 지점 다이얼 (0.1 반올림)
export function convertDial(
  profiles: GrinderProfiles,
  from: StoreId,
  to: StoreId,
  dial: number
): number | null {
  const f = fitDialToMicron(profiles[from]?.points);
  const t = fitDialToMicron(profiles[to]?.points);
  if (!f || !t || !Number.isFinite(dial)) return null;
  const converted = micronToDial(t, dialToMicron(f, dial));
  if (!Number.isFinite(converted)) return null;
  return Math.round(converted * 10) / 10;
}

// 두 지점 모두 피팅 가능한 상태인지
export const calibrationReady = (profiles: GrinderProfiles, a: StoreId, b: StoreId) =>
  !!(fitDialToMicron(profiles[a]?.points) && fitDialToMicron(profiles[b]?.points));

// --- 2026-07-16 실측 기반 잠정 환산 (측정점 피팅 확보 전 폴백) ---
// 동일 원두 3종 × 3샷 × 2지점, 다이얼 6.5 실측: 양재천 평균 915.1µm vs 판교 728.5µm
// → 판교가 -186.6µm 가늘게 갈림 (docs/garden-grind-calibration-log.md).
// 다이얼→µm 기울기는 미실측이라 EK43 통상 범위(90~120µm/다이얼 1.0)로 잠정 범위를 낸다.
// 판교 8.0 실측으로 기울기가 확정되면 profiles 기반 convertDial이 우선 적용된다.
export const MEASURED_OFFSET_UM_20260716 = 186.6;
const EK43_SLOPE_RANGE: [number, number] = [120, 90]; // µm per 다이얼 1.0 (좁은 추정 → 넓은 추정)

const round1 = (v: number) => Math.round(v * 10) / 10;

export function pangyoDialRange(yangjaeDial: number): { min: number; max: number } {
  return {
    min: round1(yangjaeDial + MEASURED_OFFSET_UM_20260716 / EK43_SLOPE_RANGE[0]),
    max: round1(yangjaeDial + MEASURED_OFFSET_UM_20260716 / EK43_SLOPE_RANGE[1]),
  };
}

// 표기용 판교 다이얼 — 피팅 준비 시 확정값(convertDial), 아니면 실측 오프셋 기반 잠정 범위
export function pangyoDialText(
  profiles: GrinderProfiles,
  yangjaeDial: number
): { text: string; provisional: boolean } | null {
  if (!Number.isFinite(yangjaeDial)) return null;
  const exact = convertDial(profiles, 'yangjae', 'pangyo', yangjaeDial);
  if (exact != null) return { text: exact.toFixed(1), provisional: false };
  const { min, max } = pangyoDialRange(yangjaeDial);
  return { text: `${min.toFixed(1)}~${max.toFixed(1)}`, provisional: true };
}
