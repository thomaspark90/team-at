import { STEP_MIN } from './time';

// 출퇴근 → 실제 근무 구간(순수). 분은 KST 0시 기준.
export const kstMinutes = (iso: string): number => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const kstDate = (iso: string): string => new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);

/** 30분 단위 반올림. 끝이 시작보다 늦지 않으면 30분으로 늘린다. */
export function roundedSegment(inMin: number, outMin: number): { start: number; end: number } {
  const r = (m: number) => Math.min(1440, Math.max(0, Math.round(m / STEP_MIN) * STEP_MIN));
  const start = r(inMin);
  let end = r(outMin);
  if (end <= start) end = Math.min(1440, start + STEP_MIN);
  return { start, end };
}

export interface ClockEvent {
  staffId: number;
  kind: 'in' | 'out';
  at: string;
}
/** 지금 출근 상태인 사람(마지막 이벤트가 in). */
export function clockedIn(events: ClockEvent[]): Map<number, string> {
  const last = new Map<number, ClockEvent>();
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) last.set(e.staffId, e);
  const out = new Map<number, string>();
  for (const [id, e] of Array.from(last)) if (e.kind === 'in') out.set(id, e.at);
  return out;
}
