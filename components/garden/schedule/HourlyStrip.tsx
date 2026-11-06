import { fmtMd } from '@/lib/teaching/kst';
import { hourlyStaff, laneOrder, roleCountsOf } from '@/lib/schedule/time';
import { STAFF_ROLES, type Shift, type Staff } from '@/lib/schedule/types';

// 시간대별 인원 — 날짜마다 6~22시 칸에 인원수 · 역할별 요약(커피3 제과1 콜드2) · 이름 아래 역할.
// 이름은 사람마다 한 줄만 쓰고(두 역할이어도 중복 없음), 출근 시각 순으로 줄을 고정한다 —
// 먼저 퇴근한 사람 자리는 비워 두어 다른 이름이 위로 밀려 올라가지 않는다(2026-11-06 대표 지시).
const FROM = 6;
const TO = 22;
const HOURS = Array.from({ length: TO - FROM }, (_, i) => FROM + i);
const LABEL = new Map(STAFF_ROLES.map((r) => [r.key, r.label]));
// 줄 높이 — 역할이 있는 사람은 이름 아래 역할 줄이 하나 더. 같은 사람은 모든 시간 칸에서 같은 줄이라 높이가 맞는다.
const LINE = 14;

export default function HourlyStrip({ days, shifts, staff }: { days: string[]; shifts: Shift[]; staff: Staff[] }) {
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const rolesOf = new Map(staff.map((s) => [s.id, s.roles]));
  const roleText = (id: number) => (rolesOf.get(id) ?? []).map((k) => LABEL.get(k)).join('·');
  const laneHeight = (id: number) => (roleText(id) ? LINE * 2 : LINE);
  const rows = days.map((d) => {
    const dayShifts = shifts.filter((s) => s.date === d);
    const hours = hourlyStaff(dayShifts, FROM, TO);
    const lanes = laneOrder(dayShifts, (id) => nameOf.get(id) ?? '');
    return {
      d,
      lanes,
      cells: hours.map((ids) => {
        const byRole = roleCountsOf(ids, rolesOf);
        const summary = STAFF_ROLES.filter((r) => byRole[r.key].length > 0).map((r) => `${r.label}${byRole[r.key].length}`).join(' ');
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
          {rows.map(({ d, lanes, cells }) => (
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
                        {c.none > 0 && <span className="text-amber-600">{c.summary ? ' ' : ''}미지정{c.none}</span>}
                      </div>
                      <div className="mt-1">
                        {c.lane.map((id, k) => (
                          <div key={k} style={{ height: laneHeight(lanes[k]) }} className="text-caption leading-[14px]">
                            {id != null && (
                              <>
                                <div className="text-foreground">{nameOf.get(id)}</div>
                                {roleText(id) && <div className="text-muted-foreground">{roleText(id)}</div>}
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
