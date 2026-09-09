'use client';

import { useState } from 'react';
import { fmtMd, fmtRange } from '@/lib/teaching/kst';
import { topicLabel } from '@/lib/teaching/topics';
import { STORES, type StoreId } from '@/lib/types';
import { api, type Shift, type TeachingMe } from './types';
import TeachingPushToggle from './TeachingPushToggle';

// 티칭 일정 — 날짜·시간·지점·티칭 스태프·교육 대상 스탭.
//  · 대표(admin): 여기서 등록·삭제. 같은 사람·같은 날 다시 넣으면 지점·시간·대상이 통째로 바뀐다.
//  · 티칭 스태프(운영 권한 역할): 자기 일정만 읽는다 — "몇 일(요일) 몇 시 어느 지점에서 누구를" (2026-09-09 대표 결정: 입력은 대표만).
//  · 교육 대상 이름 아래엔 그 스탭이 아직 못 받은 요청 주제가 붙어 뭘 준비할지 바로 보인다.
//  · 전날 20시 교육 대상(지정 없으면 지점 스탭 전원)과 티칭 스태프 본인에게 푸시가 나간다.

const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;

export default function ShiftCalendar({ me, onChange }: { me: TeachingMe; onChange: () => void }) {
  const isAdmin = me.role === 'admin';
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [store, setStore] = useState<StoreId>(me.profile?.stores[0] ?? 'pangyo');
  const [managerId, setManagerId] = useState(me.managers[0]?.userId ?? '');
  const [trainees, setTrainees] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 티칭 스태프는 자기 일정만, 대표는 전체. 응답은 날짜·시간순이라 첫 항목이 다음 일정
  const mine = isAdmin ? me.shifts : me.shifts.filter((s) => s.managerId === me.userId);
  const next = mine[0];
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
      setTrainees(new Set());
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

  const when = (s: Shift) => [fmtMd(s.date), fmtRange(s.startTime, s.endTime)].filter(Boolean).join(' ');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-medium">교육</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {isAdmin
            ? '티칭 일정(날짜·시간·지점·교육 대상)과 지점별 교육 요청을 관리합니다.'
            : `${me.profile?.name} ${me.profile?.roleLabel ?? '매니저'} — 아래는 대표가 잡아둔 내 티칭 일정입니다. 교육 대상 아래 주제가 그 스탭이 배우고 싶어 하는 것이에요.`}
        </p>
      </div>

      {next ? (
        <p className="text-[15px]">
          다음 {isAdmin ? '일정' : '출근'} <span className="tabular">{when(next)}</span> {storeLabel(next.store)}
          {isAdmin && <span className="text-muted-foreground"> · {next.managerName}</span>}
          {next.trainees.length > 0 && (
            <span className="text-muted-foreground"> · {next.trainees.map((t) => t.name).join(', ')}</span>
          )}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {isAdmin ? '등록된 일정이 없어요. 아래에서 추가하세요.' : '아직 잡힌 일정이 없어요. 대표가 등록하면 여기에 뜹니다.'}
        </p>
      )}

      {mine.length > 0 && (
        <ul className="divide-y divide-border">
          {mine.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3 text-[13px]">
              <span className={`w-[150px] shrink-0 tabular ${s.date === me.today ? 'text-emerald-600' : ''}`}>{when(s)}</span>
              <span className="w-[44px] shrink-0 text-muted-foreground">{STORES.find((x) => x.id === s.store)?.short}</span>
              {isAdmin && <span className="w-[60px] shrink-0 text-muted-foreground">{s.managerName}</span>}
              <div className="min-w-0 flex-1">
                {s.trainees.length === 0 ? (
                  <span className="text-muted-foreground">교육 대상 지정 없음{!isAdmin && ' — 그 지점 스탭 요청을 아래에서 보세요'}</span>
                ) : (
                  <ul className="space-y-1">
                    {s.trainees.map((t) => (
                      <li key={t.userId}>
                        <span>{t.name}</span>
                        {t.openTopics.length > 0 && (
                          <span className="text-muted-foreground"> · {t.openTopics.map(topicLabel).join(' · ')}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {isAdmin && (
                <button className="text-[11px] text-muted-foreground underline underline-offset-2" onClick={() => remove(s.id)}>
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="space-y-4">
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
            <span className="ta-label">교육 대상 ({storeLabel(store)} 스탭)</span>
            {storeStaff.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">이 지점에 승인된 스탭이 없어요. 비워 두면 지점 스탭 전원에게 알림이 갑니다.</p>
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
              {busy ? '저장 중…' : '일정 추가'}
            </button>
            {error && <span className="ta-error text-[13px]">{error}</span>}
          </div>
        </div>
      )}
      {!isAdmin && error && <p className="ta-error text-[13px]">{error}</p>}

      <TeachingPushToggle />
    </div>
  );
}
