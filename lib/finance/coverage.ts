// 월 커버리지 판정 — 업로드된 자료의 날짜 구간(들)이 해당 월을 충분히 덮는지.
// 거래가 없는 날(휴무·주말)이 있으므로 딱 1일/말일을 요구하지 않고 여유(TOLERANCE)를 둔다:
// 시작 ≤ 3일, 끝 ≥ 말일-3일, 구간 사이 공백 ≤ 3일이면 이어진 것으로 본다.

export interface DayInterval {
  start: string; // 'YYYY-MM-DD'
  end: string;
}

export interface Coverage {
  full: boolean; // 월 전체를 덮음(여유 적용)
  label: string | null; // 사람이 읽는 구간 표기, 예: '6/5~6/15' 또는 '6/1~10 · 6/20~30'
  pct: number; // 월 일수 대비 덮인 일수 %
}

const TOLERANCE = 3; // 일

const dayOfMonth = (iso: string) => Number(iso.slice(8, 10));
const lastDayOf = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

// 구간들을 월 안으로 자르고 병합(공백 ≤ TOLERANCE 는 이어붙임) → 일 단위 [시작, 끝] 목록
function mergedDays(ym: string, intervals: DayInterval[]): [number, number][] {
  const last = lastDayOf(ym);
  const clipped = intervals
    .map((iv) => {
      const s = iv.start.slice(0, 7) < ym ? 1 : iv.start.slice(0, 7) > ym ? null : dayOfMonth(iv.start);
      const e = iv.end.slice(0, 7) > ym ? last : iv.end.slice(0, 7) < ym ? null : dayOfMonth(iv.end);
      return s == null || e == null || s > e ? null : ([s, e] as [number, number]);
    })
    .filter((x): x is [number, number] => x !== null)
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [s, e] of clipped) {
    const prev = merged[merged.length - 1];
    if (prev && s <= prev[1] + TOLERANCE + 1) prev[1] = Math.max(prev[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

export function monthCoverage(ym: string, intervals: DayInterval[]): Coverage {
  const last = lastDayOf(ym);
  const merged = mergedDays(ym, intervals);
  if (merged.length === 0) return { full: false, label: null, pct: 0 };

  const coveredDays = merged.reduce((s, [a, b]) => s + (b - a + 1), 0);
  const full = merged.length === 1 && merged[0][0] <= 1 + TOLERANCE && merged[0][1] >= last - TOLERANCE;
  const mo = Number(ym.split('-')[1]);
  const label = merged.map(([a, b]) => `${mo}/${a}~${b}`).join(' · ');
  return { full, label, pct: Math.min(100, Math.round((coveredDays / last) * 100)) };
}
