'use client';

import { useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';
import type { Staff } from '@/lib/schedule/types';

// 근무자 명부 — 추가·지점 변경·재직 끄기. 지난 기록을 지키기 위해 삭제는 없다.
export default function RosterPanel({ staff, onChanged }: { staff: Staff[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [homeStore, setHomeStore] = useState<StoreId>('yangjae');
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const send = async (method: 'POST' | 'PATCH', body: unknown) => {
    setError(null);
    const r = await fetch('/api/garden-schedule/staff', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ?? '저장하지 못했습니다.');
      return false;
    }
    onChanged();
    return true;
  };
  const list = showAll ? staff : staff.filter((s) => s.active);

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send('POST', { name, homeStore })) setName('');
        }}
      >
        <input className="ta-input w-[160px]" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="지점" className="ta-input w-[110px]" value={homeStore} onChange={(e) => setHomeStore(e.target.value as StoreId)}>
          {STORES.map((s) => <option key={s.id} value={s.id}>{s.short}</option>)}
        </select>
        <button type="submit" className="ta-btn" disabled={!name.trim()}>추가</button>
        <label className="ml-auto flex items-center gap-2 text-body text-muted-foreground">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 지난 근무자 포함
        </label>
      </form>
      {error && <p className="m-0 mt-2 text-body text-destructive">{error}</p>}
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="text-left text-caption text-muted-foreground">
            <th className="px-3 py-2 font-normal">이름</th>
            <th className="px-3 py-2 font-normal">기본 지점</th>
            <th className="px-3 py-2 font-normal">입사일</th>
            <th className="px-3 py-2 font-normal">재직</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id} className="border-t border-border text-body">
              <td className="px-3 py-2">{s.name}</td>
              <td className="px-3 py-2">
                <select aria-label={`${s.name} 지점`} className="ta-input w-[100px]" value={s.homeStore} onChange={(e) => send('PATCH', { id: s.id, homeStore: e.target.value })}>
                  {STORES.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
                </select>
              </td>
              <td className="px-3 py-2 tabular text-muted-foreground">{s.joinedOn ?? '–'}</td>
              <td className="px-3 py-2">
                <input type="checkbox" aria-label={`${s.name} 재직`} checked={s.active} onChange={(e) => send('PATCH', { id: s.id, active: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
