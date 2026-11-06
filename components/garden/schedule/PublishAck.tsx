'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 직원 링크의 '확인했어요' — 이름을 고르고 누른다(본인 확인 없음, 2026-11-06 대표 결정). 재배포되면 다시 확인.
export default function PublishAck({
  token,
  weekStart,
  people,
  acked,
}: {
  token: string;
  weekStart: string;
  people: { id: number; name: string }[];
  acked: number[];
}) {
  const router = useRouter();
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = new Set(acked);
  const pending = people.filter((p) => !done.has(p.id));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch('/api/schedule-link/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, weekStart, staffId: Number(staffId) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? '확인하지 못했습니다.');
    setStaffId('');
    router.refresh();
  };

  return (
    <div className="ta-panel">
      <p className="m-0 text-body">스케줄을 확인했으면 이름을 고르고 눌러 주세요.</p>
      {pending.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="이름" className="ta-input w-[150px]" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">이름</option>
            {pending.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className="ta-btn-primary" disabled={busy || !staffId} onClick={submit}>확인했어요</button>
        </div>
      ) : (
        <p className="m-0 mt-2 text-body text-emerald-600">모두 확인했습니다.</p>
      )}
      {acked.length > 0 && (
        <p className="m-0 mt-3 text-caption text-muted-foreground">확인: {people.filter((p) => done.has(p.id)).map((p) => p.name).join(', ')}</p>
      )}
      {error && <p className="m-0 mt-2 text-body text-destructive">{error}</p>}
    </div>
  );
}
