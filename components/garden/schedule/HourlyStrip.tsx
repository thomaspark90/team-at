'use client';

import { useEffect, useState } from 'react';
import { fmtMd } from '@/lib/teaching/kst';
import { hourlyStaff, laneOrder, roleCountsOf } from '@/lib/schedule/time';
import type { Shift, Staff, TagDef } from '@/lib/schedule/types';
import type { StoreId } from '@/lib/types';
import RoleEditor from './RoleEditor';

// 시간대별 인원 — 날짜마다 6~22시 칸에 인원수 · 역할별 요약(색 점+수) · 이름(옆에 역할 색 점).
// 이름은 사람마다 한 줄만 쓰고(두 역할이어도 중복 없음), 출근 시각 순으로 줄을 고정한다 —
// 먼저 퇴근한 사람 자리는 비워 두어 다른 이름이 위로 밀려 올라가지 않는다(2026-11-06 대표 지시).
// 역할 표시는 우측 상단 버튼으로 숨길 수 있다(브라우저에 기억). 범례도 같은 자리. 운영진은 '역할 편집'으로 그 자리에서 역할을 고친다.
const FROM = 6;
const TO = 22;
const HOURS = Array.from({ length: TO - FROM }, (_, i) => FROM + i);
const NONE_COLOR = 'transparent';
// 범례 — 같은 색(제빵·제과)은 한 항목으로
const legendOf = (roles: TagDef[]) =>
  roles.reduce<{ color: string; label: string }[]>((acc, r) => {
    const color = r.color ?? NONE_COLOR;
    const hit = acc.find((x) => x.color === color);
    if (hit) hit.label += `·${r.label}`;
    else acc.push({ color, label: r.label });
    return acc;
  }, []);
const STORAGE_KEY = 'garden-schedule-show-roles';

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-block h-[9px] w-[9px] shrink-0 rounded-full border border-foreground/30 align-middle"
      style={{ background: color }}
    />
  );
}

export default function HourlyStrip({
  days,
  shifts,
  staff,
  roles,
  store,
  onStaffChanged,
}: {
  days: string[];
  shifts: Shift[];
  staff: Staff[];
  roles: TagDef[];
  store: StoreId;
  onStaffChanged?: () => Promise<void> | void; // 있으면 운영진 — 역할 편집 버튼을 보여준다
}) {
  const [showRoles, setShowRoles] = useState(true);
  const [editingRoles, setEditingRoles] = useState(false);
  useEffect(() => {
    setShowRoles(localStorage.getItem(STORAGE_KEY) !== '0');
  }, []);
  const toggleRoles = () => {
    setShowRoles((v) => {
      localStorage.setItem(STORAGE_KEY, v ? '0' : '1');
      return !v;
    });
  };

  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const rolesOf = new Map(staff.map((s) => [s.id, s.roles]));
  const COLOR = new Map(roles.map((r) => [r.key, r.color ?? NONE_COLOR]));
  const LABEL = new Map(roles.map((r) => [r.key, r.label]));
  const LEGEND = legendOf(roles);
  const roleKeys = roles.map((r) => r.key);
  const rows = days.map((d) => {
    const dayShifts = shifts.filter((s) => s.date === d);
    const hours = hourlyStaff(dayShifts, FROM, TO);
    const lanes = laneOrder(dayShifts, (id) => nameOf.get(id) ?? '');
    return {
      d,
      cells: hours.map((ids) => {
        const byRole = roleCountsOf(ids, rolesOf, roleKeys);
        return {
          ids,
          // 역할별 인원 — 두 역할인 사람은 두 역할에 다 센다(맡을 수 있는 사람 수). 역할 없는 사람은 빈 점.
          summary: [
            ...roles.filter((r) => byRole[r.key].length > 0).map((r) => ({ color: r.color ?? NONE_COLOR, label: r.label, n: byRole[r.key].length })),
            ...(byRole.none.length ? [{ color: NONE_COLOR, label: '역할 미지정', n: byRole.none.length }] : []),
          ],
          lane: lanes.map((id) => (ids.includes(id) ? id : null)),
        };
      }),
    };
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-title">시간대별 인원</h2>
        <div className="flex flex-wrap items-center gap-4">
          {showRoles && (
            <ul className="m-0 flex list-none items-center gap-3 p-0 text-caption text-muted-foreground" aria-label="역할 범례">
              {LEGEND.map((l) => (
                <li key={l.color} className="flex items-center gap-1"><Dot color={l.color} label={l.label} />{l.label}</li>
              ))}
              <li className="flex items-center gap-1"><Dot color={NONE_COLOR} label="역할 미지정" />미지정</li>
            </ul>
          )}
          <div className="flex flex-col items-end gap-1">
            <button type="button" className="ta-btn" onClick={toggleRoles}>{showRoles ? '담당 역할 숨기기' : '담당 역할 보이기'}</button>
            {onStaffChanged && (
              <button type="button" className="text-caption text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setEditingRoles(true)}>
                역할 편집하기
              </button>
            )}
          </div>
        </div>
      </div>
      {editingRoles && onStaffChanged && <RoleEditor staff={staff} roles={roles} store={store} onChanged={onStaffChanged} onClose={() => setEditingRoles(false)} />}
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
                        {showRoles && (
                          // 칸 폭보다 길 수 있어 줄바꿈 — 높이를 2줄로 고정해야 아래 이름 줄이 칸마다 같은 높이에서 시작한다
                          <div className="flex h-[28px] flex-wrap content-start gap-x-2 overflow-hidden text-caption tabular leading-[14px] text-muted-foreground">
                            {c.summary.map((s) => (
                              <span key={s.label} className="flex items-center gap-[3px]" title={`${s.label} ${s.n}명`}>
                                <Dot color={s.color} label={s.label} />{s.n}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-1">
                          {c.lane.map((id, k) => (
                            <div key={k} className="flex h-[14px] items-center gap-1 text-caption leading-[14px]">
                              {id != null && (
                                <>
                                  <span className="text-foreground">{nameOf.get(id)}</span>
                                  {showRoles &&
                                    (rolesOf.get(id) ?? []).filter((r) => COLOR.has(r)).map((r) => <Dot key={r} color={COLOR.get(r)!} label={LABEL.get(r) ?? r} />)}
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
    </div>
  );
}
