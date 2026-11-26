'use client';

import { dowOf, fmtMd } from '@/lib/teaching/kst';
import { fmtSegment, hoursOf } from '@/lib/schedule/time';
import { STORES } from '@/lib/types';
import type { Shift, Staff, WeekData } from '@/lib/schedule/types';

// 사람×요일 표. shifts 는 현재 보기(계획 또는 실제 반영)의 전 지점 근무.
// 날짜 머리의 복사·붙여넣기 — 한 날의 근무(현재 지점)를 다른 날로 옮긴다. 복사한 날은 취소할 때까지 여러 날에 붙여넣을 수 있다.
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
  copyDay,
  onCopyDay,
  onPasteDay,
  cellMarks,
  weekWarn,
  onPrevWeek,
  onNextWeek,
}: {
  week: WeekData;
  rows: Staff[];
  shifts: Shift[];
  planShifts: Shift[];
  showPlanDiff: boolean;
  onCell?: (staff: Staff, date: string) => void;
  onNote?: (date: string) => void;
  copyDay?: string | null; // 복사해 둔 날짜
  onCopyDay?: (date: string | null) => void; // null = 취소
  onPasteDay?: (date: string) => void;
  cellMarks?: Map<string, { warnings: string[]; leave?: string }>; // `${staffId}|${date}` — 충돌 경고·연차/불가 표시(운영진 계획 보기)
  weekWarn?: Map<number, string>; // 사람별 주 전체 경고(주 52시간)
  onPrevWeek?: () => void; // 표 왼쪽 화살표 — 지난주
  onNextWeek?: () => void; // 표 오른쪽 화살표 — 다음주
}) {
  const at = (list: Shift[], staffId: number, date: string) =>
    list.filter((s) => s.staffId === staffId && s.date === date);
  const label = (list: Shift[]) =>
    list.filter((s) => s.start != null && s.end != null).map((s) => fmtSegment({ start: s.start!, end: s.end! })).join(', ');

  // 표 양옆 화살표 — 표 높이만큼 길게 눌리고, 화살표는 스크롤해도 화면 가운데에 머문다.
  const arrow = (label: string, glyph: string, onClick?: () => void) =>
    onClick && (
      <button type="button" aria-label={label} title={label} className="w-9 shrink-0 self-stretch rounded-md text-title text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onClick}>
        <span className="sticky top-1/2 block">{glyph}</span>
      </button>
    );

  return (
    <div className="flex gap-1">
      {arrow('지난주', '‹', onPrevWeek)}
    <div className="min-w-0 flex-1 overflow-x-auto">
      <table className="w-full min-w-[880px] table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-[96px] px-3 py-2 text-left text-caption font-normal text-muted-foreground">이름</th>
            {week.days.map((d) => (
              <th key={d} className={`px-1 py-2 text-left text-caption font-normal tabular ${dowOf(d) === '월' ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                <span className="flex items-center gap-2">
                  <span className={copyDay === d ? 'text-foreground' : ''}>{fmtMd(d)}</span>
                  {onCopyDay && onPasteDay && (
                    copyDay === d ? (
                      <button type="button" className="text-caption text-foreground underline underline-offset-2" onClick={() => onCopyDay(null)}>복사됨 · 취소</button>
                    ) : copyDay ? (
                      <button type="button" className="text-caption text-foreground underline underline-offset-2" onClick={() => onPasteDay(d)}>붙여넣기</button>
                    ) : (
                      shifts.some((s) => s.date === d && s.store === week.store && !s.isOff) && (
                        <button type="button" className="text-caption text-muted-foreground hover:text-foreground" onClick={() => onCopyDay(d)}>복사</button>
                      )
                    )
                  )}
                </span>
              </th>
            ))}
            <th className="w-[60px] px-3 py-2 text-right text-caption font-normal text-muted-foreground">주간</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-1 text-body">
                {p.name}
                {p.employment === 'part_time' && <span className="ml-1 text-caption text-muted-foreground" title="파트타임">PT</span>}
              </td>
              {week.days.map((d) => {
                const cell = at(shifts, p.id, d);
                const here = cell.filter((s) => s.store === week.store);
                const elsewhere = cell.filter((s) => s.store !== week.store && !s.isOff);
                const off = here.some((s) => s.isOff);
                const planned = label(at(planShifts, p.id, d).filter((s) => s.store === week.store));
                const text = off ? '쉼' : label(here);
                const changed = showPlanDiff && !!planned && planned !== text;
                const uncertain = here.some((s) => s.uncertain);
                const clocked = here.some((s) => s.source === 'clock');
                const mark = cellMarks?.get(`${p.id}|${d}`);
                const warned = !!mark?.warnings.length;
                const body = (
                  <>
                    <span className={`block tabular text-body ${off ? 'text-muted-foreground' : ''} ${changed ? 'text-amber-600' : ''}`}>
                      {text || (onCell ? <span className="text-muted-foreground/40">–</span> : '')}
                      {uncertain && <span className="ml-1 text-caption text-amber-600" title="시트 메모상 실제와 다를 수 있는 기록">부정확</span>}
                      {clocked && <span className="ml-1 text-caption text-muted-foreground" title="출퇴근 기록으로 생긴 실제 근무">출퇴근</span>}
                    </span>
                    {changed && <span className="block text-caption tabular text-muted-foreground">계획 {planned}</span>}
                    {elsewhere.length > 0 && <span className="block text-caption tabular text-muted-foreground">{storeShort(elsewhere[0].store)} {label(elsewhere)}</span>}
                    {mark?.leave && <span className={`block text-caption ${warned ? 'text-amber-600' : 'text-muted-foreground'}`}>{mark.leave}</span>}
                    {warned && <span className="block text-caption text-amber-600">{mark!.warnings.join(' · ')}</span>}
                  </>
                );
                return (
                  <td key={d} className="p-0">
                    {onCell ? (
                      <button type="button" className={`block h-full min-h-[44px] w-full rounded-md px-1 py-2 text-left hover:bg-accent ${warned ? 'bg-amber-500/10' : ''}`} onClick={() => onCell(p, d)}>{body}</button>
                    ) : (
                      <div className="px-1 py-2">{body}</div>
                    )}
                  </td>
                );
              })}
              <td className={`px-3 py-1 text-right text-body tabular ${weekWarn?.has(p.id) ? 'text-amber-600' : ''}`} title={weekWarn?.get(p.id)}>{hoursOf(shifts.filter((s) => s.staffId === p.id)) || ''}</td>
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
      {arrow('다음주', '›', onNextWeek)}
    </div>
  );
}
