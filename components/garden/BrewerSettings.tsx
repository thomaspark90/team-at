'use client';

import { useEffect, useState } from 'react';
import type { StoreId } from '@/lib/types';
import { toast } from '@/components/Toast';

// 가든서비스 › 설정의 「필터커피 내리는 사람」 구역(2026-11-26 대표 지시).
// 필터커피 라인업 화면에서 원두를 누르면 뜨는 이름 버튼과 추출 평가 · 레시피 수정의 이름 선택지를 여기서 고른다.
// 지점별 명단 — 후보는 그 지점에서 근무하는 재직자(직원 명부의 근무 지점)이고, 그중에서 켠 사람만 그 지점 화면에 나온다.
// 스케줄 › 직원 명부의 역할 「커피」는 근무표를 짜는 사람이 보는 표기일 뿐이라 이 명단과 묶지 않는다.
// 이름을 누르면 바로 저장된다(실패하면 되돌리고 알림). 권한이 없으면(403) 구역째 숨긴다.

interface BrewerStore {
  id: StoreId;
  label: string;
  custom: boolean; // 이 지점 명단을 설정에서 저장한 적이 있는지 — 없으면 스케줄 역할 「커피」인 사람이 켜진 상태로 보인다
  staff: { id: number; name: string; on: boolean }[];
}
interface BrewerView {
  stores: BrewerStore[];
}

const chip = (on: boolean): React.CSSProperties => ({
  height: 36,
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid hsl(var(--border))',
  background: on ? 'hsl(var(--foreground))' : 'transparent',
  color: on ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

export default function BrewerSettings() {
  const [view, setView] = useState<BrewerView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/garden-brewers', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 403) return; // 설정 권한 없음 — 구역을 그리지 않는다
        if (!r.ok) throw new Error();
        setView(await r.json());
      })
      .catch(() => setFailed(true));
  }, []);

  const toggle = async (store: StoreId, id: number) => {
    if (!view || busy) return;
    const prev = view;
    const next: BrewerView = {
      stores: view.stores.map((s) => (s.id === store ? { ...s, custom: true, staff: s.staff.map((x) => (x.id === id ? { ...x, on: !x.on } : x)) } : s)),
    };
    setView(next);
    setBusy(true);
    try {
      const res = await fetch('/api/garden-brewers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store, staffIds: next.stores.find((s) => s.id === store)!.staff.filter((x) => x.on).map((x) => x.id) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '저장에 실패했습니다.');
      setView(await res.json());
    } catch (e) {
      setView(prev);
      toast(e instanceof Error ? e.message : '저장에 실패했습니다.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!view && !failed) return null;
  const anyDefault = !!view?.stores.some((s) => !s.custom);

  return (
    <div className="py-[54px]">
      <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <p className="text-title font-medium text-foreground" style={{ margin: 0 }}>필터커피 내리는 사람</p>
          <p className="text-body text-muted-foreground" style={{ margin: '2px 0 0' }}>
            필터커피 라인업에서 원두를 누르면 뜨는 이름 버튼과 추출 평가의 이름에 나오는 사람입니다. 지점마다 그 지점에서 근무하는 사람 중에서 고릅니다. 이름을 누르면 바로 저장됩니다.
          </p>
        </div>

        {failed && (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            명단을 불러오지 못했습니다. 새로 고침해 주세요.
          </p>
        )}

        {view?.stores.map((s) => (
          <div key={s.id} className="grid gap-x-8 gap-y-3 md:grid-cols-[132px_minmax(0,1fr)]">
            <p className="text-body font-medium text-foreground" style={{ margin: 0, lineHeight: '36px' }}>
              {s.label}
              <span className="tabular text-caption font-normal text-muted-foreground"> {s.staff.filter((x) => x.on).length}명</span>
            </p>
            {s.staff.length === 0 ? (
              <p className="text-body text-muted-foreground" style={{ margin: 0, lineHeight: '36px' }}>
                이 지점에서 근무하는 재직자가 없습니다. 스케줄 › 직원 명부에서 근무 지점을 지정해 주세요.
              </p>
            ) : (
              <div role="group" aria-label={`${s.label} 필터커피 내리는 사람`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {s.staff.map((x) => (
                  <button key={x.id} type="button" className="text-body" aria-pressed={x.on} disabled={busy} onClick={() => toggle(s.id, x.id)} style={chip(x.on)}>
                    {x.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {view && (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            {anyDefault && '아직 한 번도 바꾸지 않은 지점은 직원 명부의 역할이 「커피」인 사람이 켜져 있습니다. 한 번 바꾸면 그 뒤로는 이 명단만 씁니다. '}
            후보는 스케줄 › 직원 명부의 근무 지점을 따릅니다. 두 지점에서 근무하는 사람은 지점마다 따로 켭니다. 새로 들어온 사람은 여기서 켜야 나오고, 퇴사 처리한 사람은 자동으로 빠집니다.
          </p>
        )}
      </div>
    </div>
  );
}
