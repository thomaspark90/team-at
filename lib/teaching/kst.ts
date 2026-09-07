// 교육 일정용 KST 날짜 유틸 — 일정은 'YYYY-MM-DD' 문자열(KST 벽시계)로만 다룬다.

const KST_OFFSET = 9 * 3600_000;

export const kstToday = (now = new Date()): string =>
  new Date(now.getTime() + KST_OFFSET).toISOString().slice(0, 10);

export const addDays = (ymd: string, n: number): string => {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const dowOf = (ymd: string) => DOW[new Date(ymd + 'T00:00:00Z').getUTCDay()];

/** '9/10(수)' */
export const fmtMd = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}(${dowOf(ymd)})`;

export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
