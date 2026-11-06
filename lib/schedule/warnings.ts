import { addDays } from '@/lib/teaching/kst';
import { LEAVE_LABEL, type LeaveMark, type Shift } from './types';

// 충돌 경고 — 막지 않고 표시만 한다(2026-11-06 대표 결정). 계획 보기의 전 지점 근무를 넣는다.
// 기준: 하루 10시간 초과 · 주 52시간 초과 · 6일 연속 근무 · 연차/불가일에 배치 · 두 지점 시간 겹침.
export const WARN_LIMITS = { dayHours: 10, weekHours: 52, streakDays: 6 };
export type WarnCode = 'day' | 'week' | 'streak' | 'leave' | 'overlap';
export interface Warning {
  staffId: number;
  date: string | null; // null = 주 전체(주 52시간)
  code: WarnCode;
  text: string;
}

const NOT_WORKING: LeaveMark['type'][] = ['annual', 'sick', 'off', 'sub_off', 'unavailable'];
const timed = (s: Shift): s is Shift & { start: number; end: number } => !s.isOff && s.start != null && s.end != null;

/** 주 시작 전날까지의 연속 근무일 수 — 전날부터 거꾸로 센다. */
export function streakEndingAt(workDates: Set<string>, dayBefore: string): number {
  let n = 0;
  for (let d = dayBefore; workDates.has(d); d = addDays(d, -1)) n++;
  return n;
}

export function weekWarnings(a: {
  shifts: Shift[]; // 이 주의 계획(전 지점)
  days: string[];
  leaves: LeaveMark[];
  streakBefore: Record<number, number>; // 사람별, 주 시작 전날까지의 연속 근무일
  limits?: typeof WARN_LIMITS;
}): Warning[] {
  const L = a.limits ?? WARN_LIMITS;
  const out: Warning[] = [];
  const byStaff = new Map<number, (Shift & { start: number; end: number })[]>();
  for (const s of a.shifts) {
    if (!timed(s) || !a.days.includes(s.date)) continue;
    byStaff.set(s.staffId, [...(byStaff.get(s.staffId) ?? []), s]);
  }
  const leaveOf = new Map(a.leaves.filter((l) => !l.pending && NOT_WORKING.includes(l.type)).map((l) => [`${l.staffId}|${l.date}`, l.type]));

  for (const [staffId, list] of Array.from(byStaff)) {
    let weekMin = 0;
    let run = a.streakBefore[staffId] ?? 0;
    for (const d of a.days) {
      const day = list.filter((s) => s.date === d);
      const min = day.reduce((sum, s) => sum + (s.end - s.start), 0);
      weekMin += min;
      if (min > L.dayHours * 60) out.push({ staffId, date: d, code: 'day', text: `하루 ${min / 60}시간` });
      run = day.length ? run + 1 : 0;
      if (day.length && run >= L.streakDays) out.push({ staffId, date: d, code: 'streak', text: `${run}일 연속 근무` });
      const leave = leaveOf.get(`${staffId}|${d}`);
      if (day.length && leave) out.push({ staffId, date: d, code: 'leave', text: `${LEAVE_LABEL[leave]}인 날` });
      // 두 지점 시간 겹침 — 같은 지점 안의 겹침은 입력 단계에서 막힌다
      const sorted = [...day].sort((x, y) => x.start - y.start);
      if (sorted.some((s, i) => i > 0 && s.store !== sorted[i - 1].store && s.start < sorted[i - 1].end)) {
        out.push({ staffId, date: d, code: 'overlap', text: '두 지점 시간 겹침' });
      }
    }
    if (weekMin > L.weekHours * 60) out.push({ staffId, date: null, code: 'week', text: `주 ${weekMin / 60}시간` });
  }
  return out.sort((x, y) => (x.date ?? '9').localeCompare(y.date ?? '9') || x.staffId - y.staffId);
}

/** 칸별 경고 묶음 — 표가 읽는 키 `${staffId}|${date}`. */
export const warningsByCell = (list: Warning[]): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const w of list) {
    if (!w.date) continue;
    const k = `${w.staffId}|${w.date}`;
    m.set(k, [...(m.get(k) ?? []), w.text]);
  }
  return m;
};
