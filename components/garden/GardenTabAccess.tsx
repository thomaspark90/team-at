'use client';

import { useEffect, useState } from 'react';
import { GARDEN_TABS, GARDEN_TAB_KEYS } from '@/lib/garden/tabs';

type UserRow = { id: string; email: string; tabs: string[] | null };

// 가든 탭 권한 — 사용자별로 하위 탭을 하나씩 켜고 끈다. (admin 전용 — API 403이면 부모가 숨김)
// 전부 체크 = 전체 허용(행 삭제와 동일), 일부 해제 = 허용 목록 저장.
export default function GardenTabAccess({ initial }: { initial: UserRow[] }) {
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { setUsers(initial); }, [initial]);

  const allowedSet = (u: UserRow) => new Set(u.tabs ?? GARDEN_TAB_KEYS);

  const toggle = async (u: UserRow, key: string) => {
    const next = allowedSet(u);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const tabs = GARDEN_TAB_KEYS.filter((k) => next.has(k));
    setBusyId(u.id);
    setError('');
    try {
      const res = await fetch('/api/garden-tab-access', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: u.id, email: u.email, tabs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.');
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, tabs: json.tabs } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card/40" style={{ padding: 16 }}>
      <h2 className="text-[14px] font-medium" style={{ margin: '0 0 4px' }}>가든 탭 권한</h2>
      <p className="text-[12px] text-muted-foreground" style={{ margin: '0 0 12px' }}>
        사용자별로 보이는 하위 탭을 지정합니다. 전부 켜져 있으면 전체 허용이고, 끈 탭은 나비에서 숨겨지고 직접 접근해도 이동됩니다.
      </p>
      {error && <p className="text-[12px]" style={{ color: '#c0392b', margin: '0 0 8px' }}>{error}</p>}
      {users.length === 0 && <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>표시할 사용자가 없습니다.</p>}
      <div className="flex flex-col gap-3">
        {users.map((u) => {
          const set = allowedSet(u);
          return (
            <div key={u.id} className="border-t border-border" style={{ paddingTop: 10 }}>
              <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 6 }}>
                <span className="text-[13px] font-medium">{u.email}</span>
                <span className="text-[12px] text-muted-foreground">
                  {u.tabs === null ? '전체 허용' : `${u.tabs.length}/${GARDEN_TAB_KEYS.length}개 허용`}
                </span>
                {busyId === u.id && <span className="text-[12px] text-muted-foreground">저장 중…</span>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {GARDEN_TABS.map((t) => (
                  <label key={t.key} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={set.has(t.key)}
                      disabled={busyId === u.id}
                      onChange={() => toggle(u, t.key)}
                    />
                    <span className={set.has(t.key) ? '' : 'text-muted-foreground'}>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
