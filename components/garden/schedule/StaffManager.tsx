'use client';

import { useCallback, useEffect, useState } from 'react';
import SegmentControl from '@/components/nav/SegmentControl';
import SignupRequests from './SignupRequests';
import { needsActiveCheck } from '@/lib/schedule/time';
import { STORES, type StoreId } from '@/lib/types';
import { DUTY_TAGS, STAFF_ROLES, type Staff, type StaffRole } from '@/lib/schedule/types';

// 직원 명부 화면 — 추가·이름·지점·입사일·재직. 삭제는 없다(지난 기록을 지키기 위해 재직만 끈다).
type Row = Staff & { userId: string | null; lastWorked: string | null; account: 'login' | 'roster' | null };
type Account = { userId: string; name: string | null; label: string; linkedStaffId: number | null };

type StatusFilter = 'active' | 'left' | 'all';

const api = '/api/garden-schedule/staff';

export default function StaffManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
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
    setAccounts(j.accounts ?? []);
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
    <div className="space-y-6">
    <SignupRequests onChanged={load} />
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
        <table className="w-full min-w-[1400px] border-collapse">
          <thead>
            <tr className="text-left text-caption text-muted-foreground">
              <th className="px-3 py-2 font-normal">이름</th>
              <th className="px-3 py-2 font-normal">기본 지점</th>
              <th className="px-3 py-2 font-normal">역할</th>
              <th className="px-3 py-2 font-normal">책임 태그</th>
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
                  {/* 역할 토글 — 여러 개 선택. 시간대별 인원의 역할 줄이 이 값을 읽는다 */}
                  <div className="ta-seg" role="group" aria-label={`${s.name} 역할`}>
                    {STAFF_ROLES.map((r) => {
                      const on = s.roles.includes(r.key);
                      return (
                        <button
                          key={r.key}
                          type="button"
                          aria-pressed={on}
                          className={`ta-seg-item px-2 text-caption ${on ? 'ta-seg-on' : ''}`}
                          onClick={() => send('PATCH', { id: s.id, roles: on ? s.roles.filter((k) => k !== r.key) : [...s.roles, r.key] as StaffRole[] })}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {/* 체크리스트 책임자 자동 선정에 쓴다 */}
                  <select aria-label={`${s.name} 책임 태그`} className="ta-input w-[120px]" value={s.dutyTag ?? ''} onChange={(e) => send('PATCH', { id: s.id, dutyTag: e.target.value || null })}>
                    <option value="">없음</option>
                    {DUTY_TAGS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
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
                <td className="px-3 py-2">
                  {/* 체크리스트 담당 판정의 기준. 이름이 같은 계정을 맨 위에 제안한다 */}
                  <select
                    aria-label={`${s.name} 연결 계정`}
                    className="ta-input w-[220px]"
                    value={s.userId ?? ''}
                    onChange={(e) => send('PATCH', { id: s.id, userId: e.target.value || null })}
                  >
                    <option value="">연결 안 함</option>
                    {s.account === 'roster' && s.userId && <option value={s.userId}>교육 명부(로그인 불가)</option>}
                    {accounts
                      .filter((a) => a.linkedStaffId == null || a.linkedStaffId === s.id)
                      .sort((a, b) => Number(b.name === s.name) - Number(a.name === s.name))
                      .map((a) => <option key={a.userId} value={a.userId}>{a.label}{a.name === s.name && !s.userId ? ' · 이름 같음' : ''}</option>)}
                  </select>
                </td>
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
                <td colSpan={8} className="px-3 py-4 text-body text-muted-foreground">해당하는 근무자가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
    </div>
  );
}
