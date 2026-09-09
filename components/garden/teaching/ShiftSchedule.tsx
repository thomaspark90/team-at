'use client';

import { useEffect, useState } from 'react';
import { fmtMd, fmtRange } from '@/lib/teaching/kst';
import { topicLabel } from '@/lib/teaching/topics';
import { STORES } from '@/lib/types';
import { api, type Shift, type TeachingMe } from './types';

// 티칭 일정 세로 시간표 — 일정 하나가 한 블록: 날짜(요일)·지점·시간·티칭 스태프·교육 대상 헤더 아래
// 시작~종료를 한 시간 칸으로 세로 나열. 대표는 칸 안에 바로 적고(blur/Enter 저장), 티칭 스태프는 읽기만.
//  · 시간 미정 일정은 칸 없이 '시간 미정'만. 시작만 있으면 시작~20:00, 종료만 있으면 06:00~종료.
//  · 헤더의 요청 주제 줄 = 교육 대상 스탭이 아직 못 받은 위시(뭘 준비할지).
//  · 시간 칸마다 참여 인원을 따로 고른다(2026-09-09 대표 지시: 전원이 다 들으면 매장 운영에 구멍·불필요한 교육).
//    대표는 칸 옆 이름 칩을 눌러 넣고 빼고, 티칭 스태프는 이름만 본다. 헤더 교육 대상은 칸 인원의 합집합.
//  · 장식색 없음(DESIGN_SYSTEM §1) — 첫 블록(=다음 일정)과 오늘 날짜만 emerald(시안 A: '다음 일정' 문장을 이 강조가 대신한다).

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

function SlotTrainees({
  shiftId,
  hour,
  selected,
  candidates,
  isAdmin,
  onSaved,
}: {
  shiftId: number;
  hour: number;
  selected: { userId: string; name: string }[];
  candidates: { userId: string; name: string }[];
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = new Set(selected.map((t) => t.userId));

  const toggle = async (userId: string) => {
    const next = new Set(ids);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setBusy(true);
    setError('');
    try {
      await api('/api/garden-teaching/shifts/slots', { method: 'PUT', body: JSON.stringify({ shiftId, hour, traineeIds: Array.from(next) }) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return selected.length ? (
      <span className="shrink-0 text-caption text-muted-foreground">{selected.map((t) => t.name).join(', ')}</span>
    ) : null;
  }
  if (candidates.length === 0) return null;
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {candidates.map((p) => {
        const on = ids.has(p.userId);
        return (
          <button
            key={p.userId}
            type="button"
            disabled={busy}
            onClick={() => toggle(p.userId)}
            className={`rounded-md px-2 py-0.5 text-caption shadow-soft-sm transition-colors ${on ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
          >
            {p.name}
          </button>
        );
      })}
      {error && <span className="ta-error text-caption">{error}</span>}
    </span>
  );
}

export default function ShiftSchedule({
  shifts,
  today,
  isAdmin,
  staff = [],
  onRemove,
  onSlotSaved,
}: {
  shifts: Shift[];
  today: string;
  isAdmin: boolean;
  staff?: TeachingMe['staff']; // 시간 칸 참여 인원 후보(지점으로 걸러 씀) — 대표 화면에서만 채워진다
  onRemove?: (id: number) => void;
  onSlotSaved: () => void;
}) {
  if (shifts.length === 0) return null;

  return (
    <ul className="space-y-10">
      {shifts.map((s, i) => {
        const hours = hoursOf(s);
        const slotOf = (h: number) => s.slots.find((x) => x.hour === h);
        const noteOf = (h: number) => slotOf(h)?.note ?? '';
        const candidates = staff.filter((p) => p.stores.includes(s.store)).map((p) => ({ userId: p.userId, name: p.name }));
        const names = s.trainees.map((t) => t.name).join(', ');
        const topics = Array.from(new Set(s.trainees.flatMap((t) => t.openTopics))).map(topicLabel);
        const isNext = i === 0 || s.date === today;

        return (
          <li key={s.id} className="ta-panel space-y-3">
            {/* 헤더: 날짜(요일) · 지점 · 시간 · 스태프 → 대상 */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={`text-title tabular ${isNext ? 'text-emerald-600' : ''}`}>{fmtMd(s.date)}</span>
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
            {/* 교육 대상별 세부 — 이름: ①②③ 순위 주제 먼저, 나머지 흐리게 (명부에서 대표가 적은 정보) */}
            {s.trainees.some((t) => t.openTopics.length > 0) ? (
              <ul className="space-y-0.5 text-caption">
                {s.trainees.map((t) => (
                  <li key={t.userId}>
                    <span className="text-foreground">{t.name}</span>
                    <span className="text-muted-foreground"> · </span>
                    {t.openTopics.length === 0 ? (
                      <span className="text-muted-foreground">배우고 싶은 것 미입력</span>
                    ) : (
                      t.openTopics.map((k, j) => (
                        <span key={k}>
                          {j > 0 && <span className="text-muted-foreground"> · </span>}
                          {t.priorities[k] && <span className="mr-0.5 text-foreground">{['①', '②', '③'][t.priorities[k] - 1]}</span>}
                          <span className={t.priorities[k] ? 'text-foreground' : 'text-muted-foreground'}>{topicLabel(k)}</span>
                        </span>
                      ))
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              topics.length > 0 && <p className="text-caption text-muted-foreground">배우고 싶어 하는 것 · {topics.join(' · ')}</p>
            )}

            {/* 시간 칸 — 세로 */}
            {hours.length > 0 && (
              <ol className="divide-y divide-border">
                {hours.map((h) => {
                  const note = noteOf(h);
                  const slotTrainees = slotOf(h)?.trainees ?? [];
                  return (
                    <li key={h} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-body">
                      <span className="w-[52px] shrink-0 tabular text-muted-foreground">{hh(h)}</span>
                      {isAdmin ? (
                        <SlotInput shiftId={s.id} hour={h} initial={note} onSaved={onSlotSaved} />
                      ) : (
                        <span className={`min-w-0 flex-1 ${note ? '' : 'text-muted-foreground/60'}`}>{note || '—'}</span>
                      )}
                      <SlotTrainees shiftId={s.id} hour={h} selected={slotTrainees} candidates={candidates} isAdmin={isAdmin} onSaved={onSlotSaved} />
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
