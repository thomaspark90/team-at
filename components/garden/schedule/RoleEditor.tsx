'use client';

import { useState } from 'react';
import Link from 'next/link';
import { STAFF_ROLES, type Staff, type StaffRole } from '@/lib/schedule/types';
import { STORES, type StoreId } from '@/lib/types';

// 역할 편집 창 — 시간대별 인원의 '역할 편집' 버튼이 연다. 재직자만, 이 지점 사람을 먼저.
// 저장은 직원 명부와 같은 API(PATCH /api/garden-schedule/staff). 이름·지점·재직은 직원 명부에서.
const storeShort = (id: StoreId) => STORES.find((s) => s.id === id)?.short ?? id;

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-[9px] w-[9px] rounded-full border border-foreground/30" style={{ background: color }} />;
}

export default function RoleEditor({
  staff,
  store,
  onChanged,
  onClose,
}: {
  staff: Staff[];
  store: StoreId;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = staff.filter((s) => s.active);
  const byName = (a: Staff, b: Staff) => a.name.localeCompare(b.name, 'ko');
  const here = active.filter((s) => s.homeStore === store).sort(byName);
  const others = active.filter((s) => s.homeStore !== store).sort(byName);
  const unassigned = active.filter((s) => s.roles.length === 0).length;

  const toggle = async (s: Staff, key: StaffRole) => {
    const roles = s.roles.includes(key) ? s.roles.filter((k) => k !== key) : ([...s.roles, key] as StaffRole[]);
    setBusyId(s.id);
    setError(null);
    const r = await fetch('/api/garden-schedule/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, roles }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? '저장하지 못했습니다.');
    }
    await onChanged(); // 표의 점·요약이 바로 바뀌게 주 데이터를 다시 읽는다
    setBusyId(null);
  };

  const row = (s: Staff) => (
    <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="w-[72px] text-body">{s.name}</span>
      <span className="w-[40px] text-caption text-muted-foreground">{storeShort(s.homeStore)}</span>
      <div className="ta-seg" role="group" aria-label={`${s.name} 역할`}>
        {STAFF_ROLES.map((r) => {
          const on = s.roles.includes(r.key);
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={on}
              disabled={busyId === s.id}
              className={`ta-seg-item flex items-center gap-1 px-2 text-caption ${on ? 'ta-seg-on' : ''}`}
              onClick={() => toggle(s, r.key)}
            >
              <Dot color={r.color} />
              {r.label}
            </button>
          );
        })}
      </div>
      {s.roles.length === 0 && <span className="text-caption text-amber-600">미지정</span>}
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="ta-card flex max-h-[85vh] w-full max-w-[640px] flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-title">담당 역할 편집</h2>
            <p className="m-0 mt-1 text-caption text-muted-foreground">
              누르면 바로 저장됩니다. 한 사람이 여러 역할을 맡을 수 있습니다.
              {unassigned > 0 && <span className="text-amber-600"> 미지정 {unassigned}명</span>}
            </p>
          </div>
          <button type="button" className="ta-btn" onClick={onClose}>닫기</button>
        </div>
        {error && <p className="m-0 mt-3 text-body text-destructive">{error}</p>}
        <div className="mt-4 min-h-0 overflow-y-auto">
          <ul className="m-0 list-none divide-y divide-border p-0">{here.map(row)}</ul>
          {others.length > 0 && (
            <>
              <p className="m-0 mb-1 mt-4 text-caption text-muted-foreground">다른 지점</p>
              <ul className="m-0 list-none divide-y divide-border p-0">{others.map(row)}</ul>
            </>
          )}
        </div>
        <p className="m-0 mt-4 text-caption text-muted-foreground">
          이름·지점·재직은 <Link href="/garden/schedule/staff" className="underline underline-offset-2">직원 명부</Link>에서 고칩니다.
        </p>
      </div>
    </div>
  );
}
