'use client';

import { dowOf, fmtMd } from '@/lib/teaching/kst';
import { fmtSegment, hoursOf } from '@/lib/schedule/time';
import { STORES } from '@/lib/types';
import type { Shift, Staff, WeekData } from '@/lib/schedule/types';

// 사람×요일 표. shifts 는 현재 보기(계획 또는 실제 반영)의 전 지점 근무.
// 주간 합계는 지점을 합친 값 — 지점을 오가는 사람의 근무시간이 쪼개져 보이지 않게.
const storeShort = (id: string) => STORES.find((s) => s.id === id)?.short ?? id;

export default function WeekGrid({
  week,
  rows,
  shifts,
  planShifts,
  showPlanDiff,
  onCell,
  onNote,
}: {
  week: WeekData;
  rows: Staff[];
  shifts: Shift[];
  planShifts: Shift[];
  showPlanDiff: boolean;
  onCell?: (staff: Staff, date: string) => void;
  onNote?: (date: string) => void;
}) {
  const at = (list: Shift[], staffId: number, date: string) =>
    list.filter((s) => s.staffId === staffId && s.date === date);
  const label = (list: Shift[]) =>
    list.filter((s) => s.start != null && s.end != null).map((s) => fmtSegment({ start: s.start!, end: s.end! })).join(', ');

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse">
        <thead>
          <tr>
            <th className="w-[96px] px-3 py-2 text-left text-caption font-normal text-muted-foreground">이름</th>
            {week.days.map((d) => (
              <th key={d} className={`px-1 py-2 text-left text-caption font-normal tabular ${dowOf(d) === '월' ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>{fmtMd(d)}</th>
            ))}
            <th className="w-[60px] px-3 py-2 text-right text-caption font-normal text-muted-foreground">주간</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-1 text-body">{p.name}</td>
              {week.days.map((d) => {
                const cell = at(shifts, p.id, d);
                const here = cell.filter((s) => s.store === week.store);
                const elsewhere = cell.filter((s) => s.store !== week.store && !s.isOff);
                const off = here.some((s) => s.isOff);
                const planned = label(at(planShifts, p.id, d).filter((s) => s.store === week.store));
                const text = off ? '쉼' : label(here);
                const changed = showPlanDiff && !!planned && planned !== text;
                const uncertain = here.some((s) => s.uncertain);
                const body = (
                  <>
                    <span className={`block tabular text-body ${off ? 'text-muted-foreground' : ''} ${changed ? 'text-amber-600' : ''}`}>
                      {text || (onCell ? <span className="text-muted-foreground/40">–</span> : '')}
                      {uncertain && <span className="ml-1 text-caption text-amber-600" title="시트 메모상 실제와 다를 수 있는 기록">부정확</span>}
                    </span>
                    {changed && <span className="block text-caption tabular text-muted-foreground">계획 {planned}</span>}
                    {elsewhere.length > 0 && <span className="block text-caption tabular text-muted-foreground">{storeShort(elsewhere[0].store)} {label(elsewhere)}</span>}
                  </>
                );
                return (
                  <td key={d} className="p-0">
                    {onCell ? (
                      <button type="button" className="block h-full min-h-[44px] w-full rounded-md px-1 py-2 text-left hover:bg-accent" onClick={() => onCell(p, d)}>{body}</button>
                    ) : (
                      <div className="px-1 py-2">{body}</div>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-1 text-right text-body tabular">{hoursOf(shifts.filter((s) => s.staffId === p.id)) || ''}</td>
            </tr>
          ))}
          {week.editor && (
            <tr className="border-t border-border align-top">
              <td className="px-3 py-2 text-caption text-muted-foreground">메모</td>
              {week.days.map((d) => (
                <td key={d} className="p-0">
                  <button type="button" className="block min-h-[44px] w-full whitespace-pre-line break-words rounded-md px-1 py-2 text-left text-caption text-muted-foreground hover:bg-accent" onClick={() => onNote?.(d)}>
                    {week.notes[d] || <span className="text-muted-foreground/40">+</span>}
                  </button>
                </td>
              ))}
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
