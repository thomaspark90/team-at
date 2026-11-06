import { fmtMd } from '@/lib/teaching/kst';
import { hourlyStaff } from '@/lib/schedule/time';
import type { Shift, Staff } from '@/lib/schedule/types';

// 시간대별 인원 — 날짜마다 6~22시 칸에 인원수와 이름. 시트에서 칸의 이름을 세던 것을 대신한다.
const FROM = 6;
const TO = 22;
const HOURS = Array.from({ length: TO - FROM }, (_, i) => FROM + i);

export default function HourlyStrip({ days, shifts, staff }: { days: string[]; shifts: Shift[]; staff: Staff[] }) {
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const rows = days.map((d) => ({
    d,
    hours: hourlyStaff(shifts.filter((s) => s.date === d), FROM, TO).map((ids) =>
      ids.map((id) => nameOf.get(id) ?? '').filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')),
    ),
  }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-[72px]" />
            {HOURS.map((h) => (
              <th key={h} className="px-1 pb-1 text-left text-caption font-normal tabular text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, hours }) => (
            <tr key={d} className="border-t border-border">
              <td className="py-2 pr-2 align-top text-caption tabular text-muted-foreground">{fmtMd(d)}</td>
              {hours.map((names, i) => (
                <td key={i} className="px-1 py-2 align-top" title={names.length ? `${HOURS[i]}시 ${names.length}명: ${names.join(', ')}` : undefined}>
                  {names.length > 0 && (
                    <>
                      <div className="text-caption font-medium tabular">{names.length}명</div>
                      {names.map((n) => (
                        <div key={n} className="break-keep text-caption leading-tight text-muted-foreground">{n}</div>
                      ))}
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
