'use client';

import { useState } from 'react';
import { fmtMd } from '@/lib/teaching/kst';
import { STORES, type StoreId } from '@/lib/types';
import { api, type TeachingMe } from './types';
import TeachingPushToggle from './TeachingPushToggle';

// 매니저 출근 일정 — 날짜·지점만. 매니저는 자기 일정, 대표는 모든 매니저 일정을 넣고 뺀다.
// 하루 한 지점(같은 날 다시 넣으면 지점만 바뀜). 전날 20시 스탭에게 푸시가 나간다.

const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;

export default function ShiftCalendar({ me, onChange }: { me: TeachingMe; onChange: () => void }) {
  const isAdmin = me.role === 'admin';
  const [date, setDate] = useState('');
  const [store, setStore] = useState<StoreId>(me.profile?.stores[0] ?? 'pangyo');
  const [managerId, setManagerId] = useState(me.managers[0]?.userId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 매니저는 자기 일정만, 대표는 전체. 응답은 날짜순이라 첫 항목이 다음 출근
  const mine = isAdmin ? me.shifts : me.shifts.filter((s) => s.managerId === me.userId);
  const next = mine[0];

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/garden-teaching/shifts', {
        method: 'POST',
        body: JSON.stringify({ date, store, managerId: isAdmin ? managerId : undefined }),
      });
      setDate('');
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
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-medium">교육</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {isAdmin ? '매니저 출근 일정과 지점별 교육 요청을 관리합니다.' : `${me.profile?.name} ${me.profile?.roleLabel ?? '매니저'} — 출근 일정을 등록하면 그날 지점 스탭에게 전날 저녁 알림이 갑니다.`}
        </p>
      </div>

      {next ? (
        <p className="text-[15px]">
          다음 출근 <span className="tabular">{fmtMd(next.date)}</span> {storeLabel(next.store)}
          {isAdmin && <span className="text-muted-foreground"> · {next.managerName}</span>}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">등록된 출근 일정이 없어요. 아래에서 추가하세요.</p>
      )}

      {mine.length > 0 && (
        <ul className="flex flex-wrap gap-x-6 gap-y-3 text-[13px]">
          {mine.map((s) => (
            <li key={s.id} className="flex items-center gap-2 tabular">
              <span className={s.date === me.today ? 'text-emerald-600' : ''}>{fmtMd(s.date)}</span>
              <span className="text-muted-foreground">{STORES.find((x) => x.id === s.store)?.short}</span>
              {isAdmin && <span className="text-muted-foreground">{s.managerName}</span>}
              <button className="text-[11px] text-muted-foreground underline underline-offset-2" onClick={() => remove(s.id)}>
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {isAdmin && (
          <label className="block">
            <span className="ta-label">매니저</span>
            <select className="ta-input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              {me.managers.length === 0 && <option value="">매니저 계정 없음</option>}
              {me.managers.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="ta-label">날짜</span>
          <input type="date" className="ta-input" value={date} min={me.today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="ta-label">지점</span>
          <select className="ta-input" value={store} onChange={(e) => setStore(e.target.value as StoreId)}>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <button className="ta-btn-primary" disabled={busy || !date || (isAdmin && !managerId)} onClick={add}>
          {busy ? '저장 중…' : '일정 추가'}
        </button>
        {error && <span className="ta-error text-[13px]">{error}</span>}
      </div>

      <TeachingPushToggle />
    </div>
  );
}
