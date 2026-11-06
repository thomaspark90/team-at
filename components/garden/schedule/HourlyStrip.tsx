import { fmtMd } from '@/lib/teaching/kst';
import { hourlyStaff, laneOrder, roleCountsOf } from '@/lib/schedule/time';
import { STAFF_ROLES, type Shift, type Staff } from '@/lib/schedule/types';

// 시간대별 인원 — 날짜마다 6~22시 칸에 인원수 · 역할별 요약(바3 파1 콜2) · 이름(역할 약자 포함).
// 이름은 사람마다 한 줄만 쓰고(두 역할이어도 중복 없음), 출근 시각 순으로 줄을 고정한다 —
// 먼저 퇴근한 사람 자리는 비워 두어 다른 이름이 위로 밀려 올라가지 않는다(2026-11-06 대표 지시).
const FROM = 6;
const TO = 22;
const HOURS = Array.from({ length: TO - FROM }, (_, i) => FROM + i);
const SHORT = new Map(STAFF_ROLES.map((r) => [r.key, r.short]));

export default function HourlyStrip({ days, shifts, staff }: { days: string[]; shifts: Shift[]; staff: Staff[] }) {
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const rolesOf = new Map(staff.map((s) => [s.id, s.roles]));
  const abbr = (id: number) => (rolesOf.get(id) ?? []).map((k) => SHORT.get(k)).join('·');
  const rows = days.map((d) => {
    const dayShifts = shifts.filter((s) => s.date === d);
    const hours = hourlyStaff(dayShifts, FROM, TO);
    const lanes = laneOrder(dayShifts, (id) => nameOf.get(id) ?? '');
    return {
      d,
      cells: hours.map((ids) => {
        const byRole = roleCountsOf(ids, rolesOf);
        const summary = STAFF_ROLES.filter((r) => byRole[r.key].length > 0).map((r) => `${r.short}${byRole[r.key].length}`).join(' ');
        return { ids, summary, none: byRole.none.length, lane: lanes.map((id) => (ids.includes(id) ? id : null)) };
      }),
    };
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-[72px]" />
            {HOURS.map((h) => (
              <th key={h} className="px-1 pb-1 text-left text-caption font-normal tabular text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, cells }) => (
            <tr key={d} className="border-t border-border">
              <td className="py-2 pr-2 align-top text-caption tabular text-foreground">{fmtMd(d)}</td>
              {cells.map((c, i) => (
                <td key={i} className="px-1 py-2 align-top whitespace-nowrap" title={c.ids.length ? `${HOURS[i]}시 ${c.ids.length}명` : undefined}>
                  {c.ids.length > 0 && (
                    <>
                      <div className="text-caption font-medium tabular">{c.ids.length}명</div>
                      {/* 역할별 인원 요약 — 두 역할인 사람은 두 역할에 다 센다(맡을 수 있는 사람 수) */}
                      <div className="text-caption tabular leading-tight text-muted-foreground">
                        {c.summary}
                        {c.none > 0 && <span className="text-amber-600">{c.summary ? ' ' : ''}미{c.none}</span>}
                      </div>
                      <div className="mt-1">
                        {c.lane.map((id, k) => (
                          <div key={k} className="h-[14px] text-caption leading-[14px]">
                            {id != null && (
                              <>
                                <span className="text-foreground">{nameOf.get(id)}</span>
                                {abbr(id) && <span className="ml-1 text-muted-foreground">{abbr(id)}</span>}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
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
