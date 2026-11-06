import { Fragment } from 'react';
import { fmtMd } from '@/lib/teaching/kst';
import { hourlyStaff, laneOrder, roleCountsOf } from '@/lib/schedule/time';
import { STAFF_ROLES, type Shift, type Staff, type StaffRole } from '@/lib/schedule/types';

// 시간대별 인원 — 날짜마다 6~22시 칸에 전체 인원수, 그 아래 역할별 줄(바리스타·파티쉐·콜드·핫·디쉬)에 이름. 줄 사이는 가로선.
// 이름은 출근 시각 순으로 사람마다 줄을 고정한다 — 먼저 퇴근한 사람 자리는 비워 두어 다른 이름이 위로 밀려 올라가지 않는다.
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
    const dayShifts = shifts.filter((s) => s.date === d);
    const hours = hourlyStaff(dayShifts, FROM, TO);
    const byRole = hours.map((ids) => roleCountsOf(ids, rolesOf));
    const lanes = laneOrder(dayShifts, (id) => nameOf.get(id) ?? '');
    return {
      d,
      hours,
      // 그 날 한 번이라도 인원이 있는 역할 줄만 그린다(빈 날은 전체 줄 하나만). 줄 안의 자리는 출근 순으로 고정.
      roleRows: ROLE_ROWS.filter((r) => byRole.some((b) => b[r.key].length > 0)).map((r) => {
        const roleLanes = lanes.filter((id) => byRole.some((b) => b[r.key].includes(id)));
        return { ...r, cells: byRole.map((b) => roleLanes.map((id) => (b[r.key].includes(id) ? id : null))) };
      }),
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
                    <td key={i} className="px-1 py-2 align-top text-caption font-medium tabular" title={list.length ? `${HOURS[i]}시 ${list.length}명: ${list.join(', ')}` : undefined}>
                      {list.length > 0 && `${list.length}명`}
                    </td>
                  );
                })}
              </tr>
              {roleRows.map((r) => (
                <tr key={`${d}-${r.key}`} className="border-t border-border/60">
                  <td className={`py-2 pr-2 align-top text-caption ${r.key === 'none' ? 'text-amber-600' : 'text-muted-foreground'}`}>{r.label}</td>
                  {r.cells.map((lane, i) => {
                    const present = names(lane.filter((id): id is number => id != null));
                    return (
                      <td key={i} className="px-1 py-2 align-top" title={present.length ? `${r.label} ${present.length}명: ${present.join(', ')}` : undefined}>
                        {present.length > 0 &&
                          lane.map((id, k) => (
                            <div key={k} className="h-[14px] break-keep text-caption leading-[14px] text-muted-foreground">
                              {id != null ? nameOf.get(id) : ''}
                            </div>
                          ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
