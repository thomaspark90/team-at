'use client';

import { useEffect, useState } from 'react';
import { fmtMd, fmtRange } from '@/lib/teaching/kst';
import { topicLabel } from '@/lib/teaching/topics';
import { STORES } from '@/lib/types';
import { api, type Shift } from './types';

// 티칭 일정 세로 시간표 — 일정 하나가 한 블록: 날짜(요일)·지점·시간·티칭 스태프·교육 대상 헤더 아래
// 시작~종료를 한 시간 칸으로 세로 나열. 대표는 칸 안에 바로 적고(blur/Enter 저장), 티칭 스태프는 읽기만.
//  · 시간 미정 일정은 칸 없이 '시간 미정'만. 시작만 있으면 시작~20:00, 종료만 있으면 06:00~종료.
//  · 헤더의 요청 주제 줄 = 교육 대상 스탭이 아직 못 받은 위시(뭘 준비할지).
//  · 장식색 없음(DESIGN_SYSTEM §1) — 오늘 날짜만 emerald.

const DEFAULT_START = 6;
const DEFAULT_END = 20;

const hourOf = (t: string | null | undefined) => (t ? Number(t.slice(0, 2)) + (Number(t.slice(3, 5)) || 0) / 60 : null);
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const storeShort = (id: string) => STORES.find((s) => s.id === id)?.short ?? id;

/** 일정의 시간 칸 목록 — [9, 10, …, 17] (09:00~18:00). 시간 미정이면 빈 배열 */
const hoursOf = (s: Shift): number[] => {
  const start = hourOf(s.startTime);
  const end = hourOf(s.endTime);
  if (start === null && end === null) return [];
  const from = Math.floor(start ?? DEFAULT_START);
  const to = Math.ceil(end ?? DEFAULT_END);
  return Array.from({ length: Math.max(to - from, 0) }, (_, i) => from + i);
};

function SlotInput({ shiftId, hour, initial, onSaved }: { shiftId: number; hour: number; initial: string; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  useEffect(() => setValue(initial), [initial]);

  const save = async () => {
    if (value.trim() === initial.trim()) return;
    setError('');
    try {
      await api('/api/garden-teaching/shifts/slots', { method: 'PUT', body: JSON.stringify({ shiftId, hour, note: value }) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <input
        className="ta-input h-8 w-full"
        placeholder="이 시간에 할 것"
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {error && <p className="ta-error mt-1 text-caption">{error}</p>}
    </div>
  );
}

export default function ShiftSchedule({
  shifts,
  today,
  isAdmin,
  onRemove,
  onSlotSaved,
}: {
  shifts: Shift[];
  today: string;
  isAdmin: boolean;
  onRemove?: (id: number) => void;
  onSlotSaved: () => void;
}) {
  if (shifts.length === 0) return null;

  return (
    <ul className="space-y-10">
      {shifts.map((s) => {
        const hours = hoursOf(s);
        const noteOf = (h: number) => s.slots.find((x) => x.hour === h)?.note ?? '';
        const names = s.trainees.map((t) => t.name).join(', ');
        const topics = Array.from(new Set(s.trainees.flatMap((t) => t.openTopics))).map(topicLabel);
        const isToday = s.date === today;

        return (
          <li key={s.id} className="space-y-3">
            {/* 헤더: 날짜(요일) · 지점 · 시간 · 스태프 → 대상 */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={`text-title tabular ${isToday ? 'text-emerald-600' : ''}`}>{fmtMd(s.date)}</span>
              <span className="text-body text-muted-foreground">{storeShort(s.store)}</span>
              <span className="text-body tabular">{fmtRange(s.startTime, s.endTime) || '시간 미정'}</span>
              {isAdmin && <span className="text-body text-muted-foreground">{s.managerName}</span>}
              <span className="text-body text-muted-foreground">→ {names || '지점 스탭 전원'}</span>
              {isAdmin && onRemove && (
                <button className="ml-auto text-caption text-muted-foreground underline underline-offset-2" onClick={() => onRemove(s.id)}>
                  삭제
                </button>
              )}
            </div>
            {topics.length > 0 && <p className="text-caption text-muted-foreground">배우고 싶어 하는 것 · {topics.join(' · ')}</p>}

            {/* 시간 칸 — 세로 */}
            {hours.length === 0 ? (
              <p className="text-caption text-muted-foreground">시간을 넣으면 한 시간 칸이 여기에 세로로 나열됩니다.</p>
            ) : (
              <ol className="divide-y divide-dashed divide-border border-y border-border">
                {hours.map((h) => {
                  const note = noteOf(h);
                  return (
                    <li key={h} className="flex items-center gap-4 py-2 text-body">
                      <span className="w-[52px] shrink-0 tabular text-muted-foreground">{hh(h)}</span>
                      {isAdmin ? (
                        <SlotInput shiftId={s.id} hour={h} initial={note} onSaved={onSlotSaved} />
                      ) : (
                        <span className={note ? '' : 'text-muted-foreground/60'}>{note || '—'}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}
