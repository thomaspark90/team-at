import { addDays } from '@/lib/teaching/kst';
import type { Segment, Shift } from './types';

// 스케줄 순수 계산 — 시각은 0시 기준 분(int), 날짜는 KST 벽시계 'YYYY-MM-DD'.

export const STEP_MIN = 30;

/** 근무 입력 버튼. 시트 2026-10월 패턴 기준. */
export const SHIFT_PRESETS: { label: string; start: number; end: number }[] = [
  { label: '오픈', start: 7 * 60, end: 16 * 60 },
  { label: '오전 파트', start: 7 * 60, end: 14 * 60 },
  { label: '마감', start: 10 * 60, end: 19 * 60 },
  { label: '야간', start: 13 * 60, end: 22 * 60 },
  { label: '주말 긴 근무', start: 11 * 60, end: 22 * 60 },
  { label: '저녁 파트', start: 17 * 60, end: 22 * 60 },
];

/** 주는 화요일 시작 — 월요일(정기 휴무)이 주의 끝에 온다. */
export function weekStartOf(ymd: string): string {
  const dow = new Date(ymd + 'T00:00:00Z').getUTCDay(); // 0=일 … 2=화
  return addDays(ymd, -((dow + 5) % 7));
}

export const weekDays = (weekStart: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** 420 → '7', 450 → '7:30' */
export const fmtMin = (m: number): string => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}:${String(r).padStart(2, '0')}` : String(h);
};

export const fmtSegment = (s: Segment): string => `${fmtMin(s.start)}–${fmtMin(s.end)}`;

/** 입력 구간 검사 — 오류 문구 또는 null. */
export function segmentError(segments: Segment[]): string | null {
  for (const s of segments) {
    if (!Number.isInteger(s.start) || !Number.isInteger(s.end)) return '시간이 올바르지 않습니다.';
    if (s.start < 0 || s.end > 1440 || s.start >= s.end) return '종료 시각은 시작보다 늦어야 합니다.';
    if (s.start % STEP_MIN || s.end % STEP_MIN) return '시간은 30분 단위로 넣어주세요.';
  }
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return '같은 날 근무 구간이 겹칩니다.';
  }
  return null;
}

const hasTime = (s: Shift): s is Shift & Segment => !s.isOff && s.start != null && s.end != null;

/** 휴게 포함 근무시간(시간 단위). */
export const hoursOf = (shifts: Shift[]): number =>
  shifts.reduce((sum, s) => (hasTime(s) ? sum + (s.end - s.start) / 60 : sum), 0);

/**
 * 실제 근무 — 사람·날짜·지점에 실제 행이 있으면 그것(쉬었음 포함), 없으면 계획 그대로.
 * 운영진은 계획과 달라진 것만 기록한다. 작성 중인 주의 계획은 근무한 것으로 치지 않는다.
 */
export function effectiveActual(shifts: Shift[], isPublished: (s: Shift) => boolean): Shift[] {
  const key = (s: Shift) => `${s.date}|${s.store}|${s.staffId}`;
  const actual = shifts.filter((s) => s.kind === 'actual');
  const recorded = new Set(actual.map(key));
  return [...actual, ...shifts.filter((s) => s.kind === 'plan' && !recorded.has(key(s)) && isPublished(s))];
}

/** 시간대별 근무자 id — 30분이라도 걸치면 그 시간 칸에 넣는다(사람 중복 제외). */
export function hourlyStaff(shifts: Shift[], fromHour: number, toHour: number): number[][] {
  return Array.from({ length: toHour - fromHour }, (_, i) => {
    const h = (fromHour + i) * 60;
    return Array.from(new Set(shifts.filter((s) => hasTime(s) && s.start < h + 60 && s.end > h).map((s) => s.staffId)));
  });
}

/** 재직으로 표시됐는데 오래 근무가 없는 사람 — 재직 여부 확인 안내용. 기록이 아예 없으면(신규) 대상 아님. */
export function needsActiveCheck(active: boolean, lastWorked: string | null, today: string, days = 30): boolean {
  if (!active || !lastWorked) return false;
  return lastWorked < addDays(today, -days);
}

/** 잔여 연차 = 총개수 − 기준일 이후 연차 사용. 총개수 미입력이면 null. */
export function leaveRemaining(
  total: number | null,
  asOf: string | null,
  records: { type: string; date: string }[],
): number | null {
  if (total == null) return null;
  return total - records.filter((r) => r.type === 'annual' && (!asOf || r.date >= asOf)).length;
}

/** 대체 잔여 = 대체근무 − 대체휴무. */
export const substituteBalance = (records: { type: string }[]): number =>
  records.filter((r) => r.type === 'sub_worked').length - records.filter((r) => r.type === 'sub_off').length;
