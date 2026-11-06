// 연차 법정 발생 개수(근로기준법 60조) — 입사일 기준 제안값. 운영진이 '적용'을 눌러야 총 연차가 된다.
// 가정: 통상근로자(주 40시간)·개근·출근율 80% 충족. 단시간 근로자는 비례(주 소정근로시간/40)인데 소정근로시간을 모르므로 제안값에 반영하지 않는다.
//  · 1년 미만: 개근한 달마다 1개(최대 11개). 입사 1년이 되는 날 소멸.
//  · 1년 이상: 15개, 3년차부터 2년마다 1개 추가, 최대 25개. 발생일 = 입사 기념일.
export interface StatutoryLeave {
  days: number;
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

export function statutoryLeave(joinedOn: string, today: string): StatutoryLeave | null {
  if (joinedOn > today) return null;
  const months = fullMonthsBetween(joinedOn, today);
  if (months < 12) return { days: Math.min(months, 11), asOf: joinedOn, basis: 'monthly', months };
  const years = Math.floor(months / 12);
  return { days: Math.min(25, 15 + Math.floor((years - 1) / 2)), asOf: addYears(joinedOn, years), basis: 'annual', months };
}
