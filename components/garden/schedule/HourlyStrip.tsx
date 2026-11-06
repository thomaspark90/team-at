import { fmtMd } from '@/lib/teaching/kst';
import { hourlyCounts } from '@/lib/schedule/time';
import type { Shift } from '@/lib/schedule/types';

// 시간대별 인원 — 날짜마다 6~22시 막대. 시트에서 칸의 이름을 세던 것을 대신한다.
const FROM = 6;
const TO = 22;
const HOURS = Array.from({ length: TO - FROM }, (_, i) => FROM + i);

export default function HourlyStrip({ days, shifts }: { days: string[]; shifts: Shift[] }) {
  const rows = days.map((d) => ({ d, counts: hourlyCounts(shifts.filter((s) => s.date === d), FROM, TO) }));
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr>
            <th className="w-[84px]" />
            {HOURS.map((h) => (
              <th key={h} className="px-[2px] pb-1 text-left text-caption font-normal tabular text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, counts }) => (
            <tr key={d}>
              <td className="py-1 pr-2 text-caption tabular text-muted-foreground">{fmtMd(d)}</td>
              {counts.map((n, i) => (
                <td key={i} className="px-[2px] py-1 align-bottom">
                  <div className="flex h-7 flex-col justify-end" title={`${HOURS[i]}시 ${n}명`}>
                    {n > 0 && <span className="text-center text-caption leading-none tabular text-muted-foreground">{n}</span>}
                    {n > 0 && <div className="mt-[2px] bg-foreground/70" style={{ height: `${Math.max(2, (n / max) * 12)}px`, borderRadius: '2px 2px 0 0' }} />}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
