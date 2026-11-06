import { fmtSegment } from './time';
import type { Shift } from './types';

// 배포 스냅샷과 비교 — '지난 배포 후 바뀐 칸'(직원 링크)과 '배포 후 고친 칸'(운영진)을 같은 함수로 만든다.
export interface SnapshotRow {
  d: string; // 날짜
  s: number; // staffId
  a: number; // 시작(분)
  b: number; // 종료(분)
}
export interface PublishChange {
  staffId: number;
  date: string;
  before: string; // '' = 근무 없음
  after: string;
}

export const snapshotOf = (shifts: Shift[]): SnapshotRow[] =>
  shifts
    .filter((s) => !s.isOff && s.start != null && s.end != null)
    .map((s) => ({ d: s.date, s: s.staffId, a: s.start!, b: s.end! }))
    .sort((x, y) => x.d.localeCompare(y.d) || x.s - y.s || x.a - y.a);

const labels = (rows: SnapshotRow[]): Map<string, string> => {
  const m = new Map<string, SnapshotRow[]>();
  for (const r of rows) {
    const k = `${r.s}|${r.d}`;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return new Map(Array.from(m, ([k, v]) => [k, v.sort((x, y) => x.a - y.a).map((r) => fmtSegment({ start: r.a, end: r.b })).join(', ')]));
};

export function diffSnapshots(prev: SnapshotRow[] | null | undefined, cur: SnapshotRow[]): PublishChange[] {
  const before = labels(prev ?? []);
  const after = labels(cur);
  const keys = Array.from(new Set(Array.from(before.keys()).concat(Array.from(after.keys()))));
  const out: PublishChange[] = [];
  for (const k of keys) {
    const b = before.get(k) ?? '';
    const a = after.get(k) ?? '';
    if (b === a) continue;
    const [s, d] = k.split('|');
    out.push({ staffId: Number(s), date: d, before: b, after: a });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.staffId - y.staffId);
}

export const isSnapshot = (v: unknown): v is SnapshotRow[] =>
  Array.isArray(v) && v.every((r) => r && typeof r.d === 'string' && Number.isInteger(r.s) && Number.isInteger(r.a) && Number.isInteger(r.b));
