import { Fragment } from 'react';
import { fmtMd } from '@/lib/teaching/kst';
import { hourlyStaff, roleCountsOf } from '@/lib/schedule/time';
import { STAFF_ROLES, type Shift, type Staff, type StaffRole } from '@/lib/schedule/types';

// 시간대별 인원 — 날짜마다 6~22시 칸에 전체 인원수·이름, 그 아래 역할별 줄(바리스타·파티쉐·콜드·핫·디쉬).
// 역할 줄은 '그 역할을 맡을 수 있는 사람' 수라, 두 역할을 가진 사람은 두 줄에 다 들어간다.
const FROM = 6;
const TO = 22;
const HOURS = Array.from({ length: TO - FROM }, (_, i) => FROM + i);
const ROLE_ROWS: { key: StaffRole | 'none'; label: string }[] = [...STAFF_ROLES, { key: 'none', label: '역할 미지정' }];

export default function HourlyStrip({ days, shifts, staff }: { days: string[]; shifts: Shift[]; staff: Staff[] }) {
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const rolesOf = new Map(staff.map((s) => [s.id, s.roles]));
  const names = (ids: number[]) => ids.map((id) => nameOf.get(id) ?? '').filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));
  const rows = days.map((d) => {
    const hours = hourlyStaff(shifts.filter((s) => s.date === d), FROM, TO);
    const byRole = hours.map((ids) => roleCountsOf(ids, rolesOf));
    return {
      d,
      hours,
      // 그 날 한 번이라도 인원이 있는 역할 줄만 그린다(빈 날은 전체 줄 하나만)
      roleRows: ROLE_ROWS.filter((r) => byRole.some((b) => b[r.key].length > 0)).map((r) => ({ ...r, cells: byRole.map((b) => b[r.key]) })),
    };
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-[84px]" />
            {HOURS.map((h) => (
              <th key={h} className="px-1 pb-1 text-left text-caption font-normal tabular text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, hours, roleRows }) => (
            <Fragment key={d}>
              <tr className="border-t border-border">
                <td className="py-2 pr-2 align-top text-caption tabular text-foreground">{fmtMd(d)}</td>
                {hours.map((ids, i) => {
                  const list = names(ids);
                  return (
                    <td key={i} className="px-1 py-2 align-top" title={list.length ? `${HOURS[i]}시 ${list.length}명: ${list.join(', ')}` : undefined}>
                      {list.length > 0 && (
                        <>
                          <div className="text-caption font-medium tabular">{list.length}명</div>
                          {list.map((n) => (
                            <div key={n} className="break-keep text-caption leading-tight text-muted-foreground">{n}</div>
                          ))}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
              {roleRows.map((r) => (
                <tr key={`${d}-${r.key}`}>
                  <td className={`py-[2px] pr-2 text-caption ${r.key === 'none' ? 'text-amber-600' : 'text-muted-foreground'}`}>{r.label}</td>
                  {r.cells.map((ids, i) => (
                    <td key={i} className="px-1 py-[2px] text-caption tabular text-muted-foreground" title={ids.length ? `${r.label} ${ids.length}명: ${names(ids).join(', ')}` : undefined}>
                      {ids.length > 0 ? ids.length : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
