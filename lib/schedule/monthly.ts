import type { Shift } from './types';
import { effectiveActual, hoursOf } from './time';

// 월 집계(순수) — 사람별 계획/실제 근무시간·근무일·예상 인건비(시급 × 실제시간, 시급 있을 때만).
export interface MonthlyRow {
  staffId: number;
  planHours: number;
  actualHours: number;
  planDays: number;
  actualDays: number;
  estPay: number | null;
}

export function monthlyRows(shifts: Shift[], publishedWeeks: Set<string>, weekOf: (date: string) => string, wageOf: (staffId: number) => number | null): MonthlyRow[] {
  const plan = shifts.filter((s) => s.kind === 'plan');
  const actual = effectiveActual(shifts, (s) => publishedWeeks.has(`${s.store}|${weekOf(s.date)}`));
  const ids = Array.from(new Set(shifts.map((s) => s.staffId)));
  return ids
    .map((id) => {
      const p = plan.filter((s) => s.staffId === id);
      const a = actual.filter((s) => s.staffId === id && !s.isOff);
      const actualHours = hoursOf(a);
      const wage = wageOf(id);
      return {
        staffId: id,
        planHours: hoursOf(p),
        actualHours,
        planDays: new Set(p.map((s) => s.date)).size,
        actualDays: new Set(a.filter((s) => s.start != null).map((s) => s.date)).size,
        estPay: wage == null ? null : Math.round(actualHours * wage),
      };
    })
    .filter((r) => r.planHours > 0 || r.actualHours > 0);
}

/** 월의 첫날·마지막날 */
export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
}
