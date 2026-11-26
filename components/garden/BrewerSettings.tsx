'use client';

import { useEffect, useState } from 'react';
import { STORES } from '@/lib/types';
import { toast } from '@/components/Toast';

// 가든서비스 › 설정의 「필터커피 내리는 사람」 구역(2026-11-26 대표 지시).
// 필터커피 라인업 화면에서 원두를 누르면 뜨는 이름 버튼과 추출 평가 · 레시피 수정의 이름 선택지를 여기서 고른다.
// 스케줄 › 직원 명부의 역할 「커피」는 근무표를 짜는 사람이 보는 표기일 뿐이라 이 명단과 묶지 않는다.
// 이름을 누르면 바로 저장된다(실패하면 되돌리고 알림). 권한이 없으면(403) 구역째 숨긴다.

interface BrewerRow {
  id: number;
  name: string;
  homeStore: string | null;
  on: boolean;
}
interface BrewerView {
  custom: boolean; // 설정에서 저장한 적이 있는지 — 없으면 스케줄 역할 「커피」인 사람이 켜진 상태로 보인다
  staff: BrewerRow[];
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

  const toggle = async (id: number) => {
    if (!view || busy) return;
    const prev = view;
    const staff = view.staff.map((s) => (s.id === id ? { ...s, on: !s.on } : s));
    setView({ custom: true, staff });
    setBusy(true);
    try {
      const res = await fetch('/api/garden-brewers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffIds: staff.filter((s) => s.on).map((s) => s.id) }),
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

  // 기본 지점별로 묶는다 — 지점 순서는 라인업 화면과 같이 양재천 먼저, 지점이 비어 있는 사람은 맨 뒤
  const groups = view
    ? [
        ...[...STORES].reverse().map((s) => ({ key: s.id as string, label: s.label, items: view.staff.filter((x) => x.homeStore === s.id) })),
        { key: 'etc', label: '지점 미지정', items: view.staff.filter((x) => !STORES.some((s) => s.id === x.homeStore)) },
      ].filter((g) => g.items.length > 0)
    : [];
  const count = view ? view.staff.filter((s) => s.on).length : 0;

  return (
    <div className="py-[54px]">
      <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <p className="text-title font-medium text-foreground" style={{ margin: 0 }}>
            필터커피 내리는 사람{view && <span className="tabular text-body font-normal text-muted-foreground"> {count}명</span>}
          </p>
          <p className="text-body text-muted-foreground" style={{ margin: '2px 0 0' }}>
            필터커피 라인업에서 원두를 누르면 뜨는 이름 버튼과 추출 평가의 이름에 나오는 사람입니다. 이름을 누르면 바로 저장됩니다.
          </p>
        </div>

        {failed && (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            명단을 불러오지 못했습니다. 새로 고침해 주세요.
          </p>
        )}

        {view && view.staff.length === 0 && (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            재직 중인 직원이 없습니다. 스케줄 › 직원 명부에서 먼저 추가해 주세요.
          </p>
        )}

        {groups.map((g) => (
          <div key={g.key} className="grid gap-x-8 gap-y-3 md:grid-cols-[132px_minmax(0,1fr)]">
            <p className="text-body font-medium text-foreground" style={{ margin: 0, lineHeight: '36px' }}>
              {g.label}
            </p>
            <div role="group" aria-label={`${g.label} 필터커피 내리는 사람`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {g.items.map((s) => (
                <button key={s.id} type="button" className="text-body" aria-pressed={s.on} disabled={busy} onClick={() => toggle(s.id)} style={chip(s.on)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ))}

        {view && (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            {view.custom
              ? '스케줄 › 직원 명부의 역할 「커피」와는 따로 관리합니다. 새로 들어온 사람은 여기서 켜야 나오고, 퇴사 처리한 사람은 자동으로 빠집니다.'
              : '아직 따로 정하지 않아, 스케줄 › 직원 명부의 역할이 「커피」인 사람이 켜져 있습니다. 여기서 한 번 바꾸면 그 뒤로는 이 명단만 쓰고 역할 표기와는 따로 관리합니다.'}
          </p>
        )}
      </div>
    </div>
  );
}
