'use client';

import { useCallback, useEffect, useState } from 'react';
import SegmentControl from '@/components/nav/SegmentControl';
import { needsActiveCheck } from '@/lib/schedule/time';
import { STORES, type StoreId } from '@/lib/types';
import type { Staff } from '@/lib/schedule/types';

// 직원 명부 화면 — 추가·이름·지점·입사일·재직. 삭제는 없다(지난 기록을 지키기 위해 재직만 끈다).
type Row = Staff & { lastWorked: string | null; account: 'login' | 'roster' | null };

const ACCOUNT_LABEL = { login: '로그인 계정', roster: '교육 명부', none: '–' };
type StatusFilter = 'active' | 'left' | 'all';

const api = '/api/garden-schedule/staff';

export default function StaffManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [today, setToday] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [store, setStore] = useState<'all' | StoreId>('all');
  const [name, setName] = useState('');
  const [homeStore, setHomeStore] = useState<StoreId>('yangjae');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(api, { cache: 'no-store' });
    const j = await r.json().catch(() => ({ error: '불러오지 못했습니다.' }));
    if (!r.ok || j.error) return setError(j.error ?? '불러오지 못했습니다.');
    setRows(j.staff);
    setToday(j.today);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const send = async (method: 'POST' | 'PATCH', body: unknown) => {
    setError(null);
    const r = await fetch(api, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error ?? '저장하지 못했습니다.');
    await load(); // 실패해도 다시 읽어 화면을 서버 값으로 되돌린다
    return r.ok;
  };

  if (!rows) return error ? <p className="m-0 text-body text-destructive">{error}</p> : <p className="m-0 text-body text-muted-foreground">불러오는 중…</p>;

  const inStore = rows.filter((r) => store === 'all' || r.homeStore === store);
  const list = inStore.filter((r) => status === 'all' || (status === 'active' ? r.active : !r.active));
  const activeCount = inStore.filter((r) => r.active).length;

  return (
    <section className="ta-panel space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <SegmentControl
          ariaLabel="재직 상태"
          items={[
            { id: 'active', label: `재직 ${activeCount}` },
            { id: 'left', label: `퇴사 ${inStore.length - activeCount}` },
            { id: 'all', label: '전체' },
          ]}
          value={status}
          onSelect={(id) => setStatus(id as StatusFilter)}
        />
        <SegmentControl
          ariaLabel="기본 지점"
          items={[{ id: 'all', label: '전 지점' }, ...STORES.map((s) => ({ id: s.id, label: s.short }))]}
          value={store}
          onSelect={(id) => setStore(id as 'all' | StoreId)}
        />
        <form
          className="ml-auto flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send('POST', { name, homeStore })) setName('');
          }}
        >
          <input aria-label="새 근무자 이름" className="ta-input w-[140px]" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
          <select aria-label="새 근무자 지점" className="ta-input w-[90px]" value={homeStore} onChange={(e) => setHomeStore(e.target.value as StoreId)}>
            {STORES.map((s) => <option key={s.id} value={s.id}>{s.short}</option>)}
          </select>
          <button type="submit" className="ta-btn" disabled={!name.trim()}>추가</button>
        </form>
      </div>

      {error && <p className="m-0 text-body text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="text-left text-caption text-muted-foreground">
              <th className="px-3 py-2 font-normal">이름</th>
              <th className="px-3 py-2 font-normal">기본 지점</th>
              <th className="px-3 py-2 font-normal">입사일</th>
              <th className="px-3 py-2 font-normal">마지막 근무</th>
              <th className="px-3 py-2 font-normal">계정</th>
              <th className="px-3 py-2 font-normal">재직</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t border-border text-body">
                <td className="px-3 py-2">
                  {/* key 에 이름을 넣어 저장 실패 시 서버 값으로 다시 그린다 */}
                  <input
                    key={s.name}
                    aria-label={`${s.name} 이름`}
                    className="ta-input w-[140px]"
                    defaultValue={s.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== s.name) send('PATCH', { id: s.id, name: v });
                      else e.target.value = s.name;
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <select aria-label={`${s.name} 지점`} className="ta-input w-[90px]" value={s.homeStore} onChange={(e) => send('PATCH', { id: s.id, homeStore: e.target.value })}>
                    {STORES.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    key={s.joinedOn ?? ''}
                    aria-label={`${s.name} 입사일`}
                    type="date"
                    className="ta-input w-[150px] tabular"
                    defaultValue={s.joinedOn ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value || null;
                      if (v !== s.joinedOn) send('PATCH', { id: s.id, joinedOn: v });
                    }}
                  />
                </td>
                <td className="px-3 py-2 tabular">
                  <span className="text-muted-foreground">{s.lastWorked ?? '–'}</span>
                  {needsActiveCheck(s.active, s.lastWorked, today) && <span className="ml-2 text-caption text-amber-600">재직 확인</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{ACCOUNT_LABEL[s.account ?? 'none']}</td>
                <td className="px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={s.active}
                      onChange={(e) => {
                        const active = e.target.checked;
                        // 로그인이 걸린 변경만 한 번 더 확인한다
                        if (!active && s.account === 'login' && !window.confirm(`${s.name}님을 퇴사 처리할까요? 로그인이 바로 막히고, 지난 기록은 '${s.name}(퇴사)'로 남습니다.`)) return;
                        send('PATCH', { id: s.id, active });
                      }}
                    />
                    <span className={s.active ? '' : 'text-muted-foreground'}>{s.active ? '재직' : '퇴사'}</span>
                  </label>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr className="border-t border-border">
                <td colSpan={6} className="px-3 py-4 text-body text-muted-foreground">해당하는 근무자가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
