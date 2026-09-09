'use client';

import { useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';
import { api, type TeachingMe } from './types';
import TeachingPushToggle from './TeachingPushToggle';
import ShiftSchedule from './ShiftSchedule';

// 티칭 일정 — 날짜·시간·지점·티칭 스태프·교육 대상 스탭.
//  · 대표(admin): 여기서 등록·삭제. 같은 사람·같은 날 다시 넣으면 지점·시간·대상이 통째로 바뀐다.
//  · 티칭 스태프(운영 권한 역할): 자기 일정만 읽는다 — "몇 일(요일) 몇 시 어느 지점에서 누구를" (2026-09-09 대표 결정: 입력은 대표만).
//  · 화면은 시안 A '접어두기'(2026-09-09 대표 선택): 보이는 건 시간표 하나. 설명문·"다음 일정" 문장 없이
//    첫 블록(=다음 일정)을 초록으로 강조하고, 입력 폼은 '+ 일정'을 눌러야 같은 자리에 펼쳐진다. 알림은 종 아이콘 하나.
//  · 일정 목록은 세로 시간표(ShiftSchedule) — 시작~종료를 한 시간 칸으로 나열, 대표가 칸마다 세부 내용을 적고 티칭 스태프는 읽는다(2026-09-09).
//  · 전날 20시 교육 대상(지정 없으면 지점 스탭 전원)과 티칭 스태프 본인에게 푸시가 나간다.

const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;

export default function ShiftCalendar({ me, onChange }: { me: TeachingMe; onChange: () => void }) {
  const isAdmin = me.role === 'admin';
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [store, setStore] = useState<StoreId>(me.profile?.stores[0] ?? 'pangyo');
  const [managerId, setManagerId] = useState(me.managers[0]?.userId ?? '');
  const [trainees, setTrainees] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 티칭 스태프는 자기 일정만, 대표는 전체. 응답은 날짜·시간순이라 첫 항목이 다음 일정
  const all = isAdmin ? me.shifts : me.shifts.filter((s) => s.managerId === me.userId);
  // 지난 2주 일정은 접어 두고 — 교육 뒤 코멘트를 남기러 들어올 때만 펼친다
  const mine = all.filter((s) => s.date >= me.today);
  const past = all.filter((s) => s.date < me.today).reverse();
  const [showPast, setShowPast] = useState(false);
  const storeStaff = me.staff.filter((p) => p.stores.includes(store));

  const changeStore = (id: StoreId) => {
    setStore(id);
    setTrainees(new Set()); // 지점이 바뀌면 대상 선택은 처음부터
  };
  const toggleTrainee = (id: string) =>
    setTrainees((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/garden-teaching/shifts', {
        method: 'POST',
        body: JSON.stringify({
          date,
          store,
          managerId,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          traineeIds: Array.from(trainees),
        }),
      });
      setDate('');
      setStartTime('');
      setEndTime('');
      setTrainees(new Set());
      setOpen(false); // 저장되면 폼은 다시 접힌다 — 시간표에 바로 뜨는 게 확인이다
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await api('/api/garden-teaching/shifts', { method: 'DELETE', body: JSON.stringify({ id }) });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-display">교육</h1>
        <div className="flex items-center gap-2">
          <TeachingPushToggle compact />
          {isAdmin && (
            <button className={open ? 'ta-btn' : 'ta-btn-primary'} onClick={() => setOpen((v) => !v)}>
              {open ? '닫기' : '+ 일정'}
            </button>
          )}
        </div>
      </div>

      {isAdmin && open && (
        <div className="ta-panel space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="ta-label">티칭 스태프</span>
              <select className="ta-input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                {me.managers.length === 0 && <option value="">계정 없음</option>}
                {me.managers.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="ta-label">날짜</span>
              <input type="date" className="ta-input" value={date} min={me.today} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="ta-label">시작</span>
              <input type="time" className="ta-input tabular" value={startTime} step={600} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="block">
              <span className="ta-label">종료</span>
              <input type="time" className="ta-input tabular" value={endTime} step={600} onChange={(e) => setEndTime(e.target.value)} />
            </label>
            <label className="block">
              <span className="ta-label">지점</span>
              <select className="ta-input" value={store} onChange={(e) => changeStore(e.target.value as StoreId)}>
                {STORES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <span className="ta-label">교육 대상 · {storeLabel(store)} <span className="normal-case tracking-normal">(비워 두고 저장 후 시간 칸마다 고를 수도 있어요)</span></span>
            {storeStaff.length === 0 ? (
              <p className="text-caption text-muted-foreground">승인된 스탭 없음 — 지점 전원에게 알림</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {storeStaff.map((p) => {
                  const on = trainees.has(p.userId);
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      className={`ta-btn h-8 ${on ? 'bg-primary text-primary-foreground hover:opacity-90' : ''}`}
                      onClick={() => toggleTrainee(p.userId)}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="ta-btn-primary" disabled={busy || !date || !managerId} onClick={add}>
              {busy ? '저장 중…' : '저장'}
            </button>
            {error && <span className="ta-error text-body">{error}</span>}
          </div>
        </div>
      )}

      {mine.length === 0 ? (
        <p className="text-body text-muted-foreground">{isAdmin ? '잡힌 일정 없음' : '잡힌 일정 없음 — 대표가 등록하면 여기에 뜹니다'}</p>
      ) : (
        <ShiftSchedule shifts={mine} today={me.today} isAdmin={isAdmin} staff={me.staff} onRemove={remove} onSlotSaved={onChange} />
      )}
      {!open && error && <p className="ta-error text-body">{error}</p>}

      {past.length > 0 && (
        <div className="space-y-4">
          <button className="text-caption text-muted-foreground underline underline-offset-2" onClick={() => setShowPast((v) => !v)}>
            지난 2주 일정 {past.length}건 {showPast ? '접기' : '펼치기 — 교육 코멘트 남기기'}
          </button>
          {showPast && (
            <ShiftSchedule shifts={past} today={me.today} isAdmin={isAdmin} staff={me.staff} highlightNext={false} onRemove={remove} onSlotSaved={onChange} />
          )}
        </div>
      )}
    </div>
  );
}
