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
