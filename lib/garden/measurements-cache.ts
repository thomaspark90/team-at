import type { GrindMeasurement } from '@/lib/grind-measurements';

// 분쇄도 측정 조회 공유 캐시 — /garden/calibration 은 업로드 폼과 차트가 각각 같은 API 를
// 부른다. 기록이 blob 1건 = 파일 1개라 조회 비용이 건수에 비례하므로 중복 호출을 없앤다.
// 아주 짧은 TTL 만 두고(같은 화면의 동시 마운트를 묶는 용도), 저장·삭제 후에는 invalidate 한다.

const TTL_MS = 3000;
let cached: { at: number; data: GrindMeasurement[] } | null = null;
let inFlight: Promise<GrindMeasurement[]> | null = null;

export function primeGrindMeasurements(data: GrindMeasurement[]) {
  cached = { at: Date.now(), data };
  inFlight = null;
}

export function invalidateGrindMeasurements() {
  cached = null;
  inFlight = null;
}

export function fetchGrindMeasurements(force = false): Promise<GrindMeasurement[]> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.data);
  if (!force && inFlight) return inFlight;
  const p = fetch('/api/garden-grind-measurements', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : []))
    .then((d) => {
      const data: GrindMeasurement[] = Array.isArray(d) ? d : [];
      cached = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = p;
  return p;
}
