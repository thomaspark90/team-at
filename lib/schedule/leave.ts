// 연차 법정 발생 개수(근로기준법 60조) — 입사일 기준 제안값. 운영진이 '적용'을 눌러야 총 연차가 된다.
// 가정: 통상근로자(주 40시간)·개근·출근율 80% 충족. 단시간 근로자는 비례(주 소정근로시간/40)인데 소정근로시간을 모르므로 제안값에 반영하지 않는다.
//  · 1년 미만: 개근한 달마다 1개(최대 11개). 입사 1년이 되는 날 소멸.
//  · 1년 이상: 15개, 3년차부터 2년마다 1개 추가, 최대 25개. 발생일 = 입사 기념일.
export interface StatutoryLeave {
  days: number; // 비례 적용 후(0.5 단위 올림)
  fullDays: number; // 통상근로자 기준
  ratio: number; // 주 소정근로시간/40 (통상 1)
  asOf: string; // 이 날 이후 사용분만 잔여에서 뺀다 — 1년 미만은 입사일, 이후는 올해 입사 기념일
  basis: 'monthly' | 'annual';
  months: number; // 입사 후 지난 개월 수(만)
}

/** from 이후 지난 만 개월 수 — 같은 날짜에 도달해야 한 달로 센다. 음수면 0. */
export function fullMonthsBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  let m = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) m -= 1;
  return Math.max(0, m);
}

/** 입사일에 n년을 더한 날 — 2/29 는 2/28 로. */
export const addYears = (ymd: string, n: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const yy = y + n;
  const last = new Date(Date.UTC(yy, m, 0)).getUTCDate();
  return `${yy}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

/** 단시간 근로자 비례 — 통상 개수 × 주 소정근로시간/40, 0.5 단위 올림(근로기준법 18조·시행령 9조, 시간 단위를 반일로 맞춤). 주 15시간 미만은 연차 없음. */
export function proratedDays(fullDays: number, weeklyHours: number | null): { days: number; ratio: number } {
  if (weeklyHours == null || weeklyHours >= 40) return { days: fullDays, ratio: 1 };
  if (weeklyHours < 15) return { days: 0, ratio: 0 };
  const ratio = weeklyHours / 40;
  return { days: Math.ceil(fullDays * ratio * 2) / 2, ratio };
}

export function statutoryLeave(joinedOn: string, today: string, weeklyHours: number | null = null): StatutoryLeave | null {
  if (joinedOn > today) return null;
  const months = fullMonthsBetween(joinedOn, today);
  const build = (fullDays: number, asOf: string, basis: StatutoryLeave['basis']): StatutoryLeave => {
    const p = proratedDays(fullDays, weeklyHours);
    return { days: p.days, fullDays, ratio: p.ratio, asOf, basis, months };
  };
  if (months < 12) return build(Math.min(months, 11), joinedOn, 'monthly');
  const years = Math.floor(months / 12);
  return build(Math.min(25, 15 + Math.floor((years - 1) / 2)), addYears(joinedOn, years), 'annual');
}

/** 두 날짜 사이 일수(to − from). */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

/** 잔여 연차 소멸일 — 기준일(발생일)로부터 1년. 1년 미만 월차도 입사 1년이 되는 날 사라지므로 같은 식(기준일 = 입사일). */
export const leaveExpiry = (asOf: string): string => addYears(asOf, 1);

export interface ExpiringLeave {
  staffId: number;
  remaining: number;
  expiresOn: string;
  daysLeft: number; // 음수면 이미 지남
}

/** 소멸이 가까운(또는 지난) 잔여 연차 — 운영진 알림용. withinDays 안에 소멸하고 잔여가 있는 사람만. */
export function expiringLeaves(
  balances: { staffId: number; total: number; asOf: string }[],
  records: { staffId: number; type: string; date: string }[],
  today: string,
  withinDays = 30,
): ExpiringLeave[] {
  return balances
    .map((b) => {
      const remaining = b.total - records.filter((r) => r.staffId === b.staffId && r.type === 'annual' && r.date >= b.asOf).length;
      const expiresOn = leaveExpiry(b.asOf);
      return { staffId: b.staffId, remaining, expiresOn, daysLeft: daysBetween(today, expiresOn) };
    })
    .filter((x) => x.remaining > 0 && x.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** 최근 근무 기록으로 주 소정근로시간 제안 — 합계 ÷ 주 수, 0.5 단위 반올림. 기록이 없으면 null. */
export function suggestWeeklyHours(hoursTotal: number, weeks: number): number | null {
  if (weeks <= 0 || hoursTotal <= 0) return null;
  return Math.round((hoursTotal / weeks) * 2) / 2;
}
