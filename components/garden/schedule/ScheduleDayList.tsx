import { fmtMd } from '@/lib/teaching/kst';
import { fmtSegment } from '@/lib/schedule/time';
import type { Shift, Staff } from '@/lib/schedule/types';

// 날짜별 근무 목록(휴대폰용) — 같은 시간대끼리 묶는다. 공유 링크 화면이 쓴다. 훅 없음.
export default function ScheduleDayList({
  days,
  shifts,
  staff,
  today,
  changed,
}: {
  days: string[];
  shifts: Shift[];
  staff: Staff[];
  today: string;
  changed?: Set<string>; // `${staffId}|${date}` — 지난 배포 후 바뀐 칸은 이름을 강조
}) {
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  return (
    <div className="space-y-8">
      {days.map((d) => {
        const groups = new Map<string, { start: number; names: { name: string; changed: boolean }[] }>();
        for (const s of shifts) {
          if (s.date !== d || s.start == null || s.end == null) continue;
          const key = fmtSegment({ start: s.start, end: s.end });
          const g = groups.get(key) ?? { start: s.start, names: [] };
          g.names.push({ name: nameOf.get(s.staffId) ?? '', changed: !!changed?.has(`${s.staffId}|${s.date}`) });
          groups.set(key, g);
        }
        const rows = Array.from(groups).sort((a, b) => a[1].start - b[1].start);
        return (
          <section key={d}>
            <h2 className="m-0 mb-2 text-body font-medium">
              {fmtMd(d)}
              {d === today && <span className="ml-2 text-caption text-emerald-600">오늘</span>}
            </h2>
            {rows.length ? (
              <ul className="m-0 list-none space-y-1 p-0">
                {rows.map(([time, g]) => (
                  <li key={time} className="flex gap-4 text-body">
                    <span className="tabular w-[64px] shrink-0 text-muted-foreground">{time}</span>
                    <span>
                      {g.names.map((n, i) => (
                        <span key={i} className={n.changed ? 'font-medium text-amber-600' : ''}>{i > 0 && ', '}{n.name}</span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-body text-muted-foreground">근무 없음</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
