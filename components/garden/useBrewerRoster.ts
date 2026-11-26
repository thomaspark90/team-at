'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StoreId } from '@/lib/types';
import type { MatrixCellState } from '@/components/MatrixCheck';

// 필터커피 내리는 사람 명단 읽기 · 켜고 끄기 — 직원 명부의 「업무 지정」 묶음용.
// 저장 방식은 가든의 BrewerSettings 와 같다(/api/garden-brewers 에 그 지점 명단을 통째로 PUT).
// 권한이 없으면(403) allowed = false 이고 모든 칸이 –(na)로 나온다.

type Roster = { stores: { id: StoreId; staff: { id: number; on: boolean }[] }[] };

export function useBrewerRoster() {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/garden-brewers', { cache: 'no-store' }).catch(() => null);
    if (!res || !res.ok) return setAllowed(res?.status === 403 ? false : null);
    setRoster(await res.json());
    setAllowed(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /** 그 지점에서 근무하지 않으면 na, 근무하면 켜짐/꺼짐 */
  const state = useCallback(
    (staffId: number | undefined, store: string): MatrixCellState => {
      const x = staffId == null ? undefined : roster?.stores.find((s) => s.id === store)?.staff.find((p) => p.id === staffId);
      return !x ? 'na' : x.on ? 'on' : 'off';
    },
    [roster],
  );

  /** 실패하면 메시지를 던진다 — 부르는 쪽이 알림을 띄운다 */
  const toggle = useCallback(
    async (staffId: number | undefined, store: string) => {
      const s = roster?.stores.find((x) => x.id === store);
      if (!s || staffId == null || !s.staff.some((p) => p.id === staffId)) return;
      const staffIds = s.staff.filter((p) => (p.id === staffId ? !p.on : p.on)).map((p) => p.id);
      const res = await fetch('/api/garden-brewers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store, staffIds }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '저장에 실패했습니다.');
      setRoster(await res.json());
    },
    [roster],
  );

  return { allowed, state, toggle, reload: load };
}
