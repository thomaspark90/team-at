'use client';

import { useCallback, useEffect, useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';
import type { RosterMatch } from '@/lib/staff/names';

// 가입 신청 대기 — 운영진이 지점을 골라 승인·거절한다. 대기가 없으면 아무것도 보이지 않는다.
type Signup = { userId: string; name: string; requestedAt: string; match: RosterMatch; homeStore: StoreId | null };

const api = '/api/garden-schedule/staff/signups';

const MATCH_LABEL: Record<RosterMatch, { text: string; cls: string }> = {
  active: { text: '명부와 일치', cls: 'text-emerald-600' },
  left: { text: '퇴사자와 같은 이름 · 승인하면 재직으로 바뀝니다', cls: 'text-amber-600' },
  none: { text: '명부에 없음 · 승인하면 명부에 추가됩니다', cls: 'text-amber-600' },
};

export default function SignupRequests({ onChanged }: { onChanged: () => void }) {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [stores, setStores] = useState<Record<string, StoreId>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(api, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setSignups(j.signups ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const send = async (method: 'POST' | 'DELETE', body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await fetch(api, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error ?? '처리하지 못했습니다.');
    await load();
    onChanged();
    setBusy(false);
  };

  if (!signups.length) return null;

  return (
    <section className="ta-panel space-y-4">
      <div>
        <h2 className="m-0 text-title font-medium">가입 신청 대기 <span className="tabular">{signups.length}명</span></h2>
        <p className="m-0 mt-1 text-body text-muted-foreground">승인하면 스탭으로 로그인할 수 있습니다. 매니저 역할과 페이지 권한은 대표가 설정에서 바꿉니다.</p>
      </div>
      {error && <p className="m-0 text-body text-destructive">{error}</p>}
      <ul className="m-0 list-none divide-y divide-border p-0">
        {signups.map((s) => {
          const store = stores[s.userId] ?? s.homeStore;
          const label = MATCH_LABEL[s.match];
          return (
            <li key={s.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="text-body">{s.name}</span>
              <span className={`text-caption ${label.cls}`}>{label.text}</span>
              <div className="ml-auto flex items-center gap-2">
                <select
                  aria-label={`${s.name} 지점`}
                  className="ta-input w-[100px]"
                  value={store ?? ''}
                  disabled={busy}
                  onChange={(e) => setStores((cur) => ({ ...cur, [s.userId]: e.target.value as StoreId }))}
                >
                  <option value="" disabled>지점</option>
                  {STORES.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
                </select>
                <button type="button" className="ta-btn" disabled={busy || !store} onClick={() => send('POST', { userId: s.userId, store })}>승인</button>
                <button
                  type="button"
                  className="ta-btn"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`${s.name}님의 가입 신청을 거절할까요? 신청이 삭제됩니다.`)) send('DELETE', { userId: s.userId });
                  }}
                >
                  거절
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
