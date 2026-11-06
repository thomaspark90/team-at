'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtMd } from '@/lib/teaching/kst';
import type { Staff } from '@/lib/schedule/types';
import { STORES } from '@/lib/types';

// 운영진의 교대 요청 처리 — 승인하면 계획 근무의 사람이 맞바뀐다(받는 쪽이 그날 이미 근무면 승인 불가 → 직접 고치기).
type Req = { id: number; store: string; requesterId: number; requesterDate: string; targetId: number; targetDate: string | null; note: string; status: 'pending' | 'approved' | 'rejected'; decidedAt: string | null };
const api = '/api/garden-schedule/swaps';

export default function SwapRequests({ staff, onChanged }: { staff: Staff[]; onChanged?: () => void }) {
  const [pending, setPending] = useState<Req[]>([]);
  const [decided, setDecided] = useState<Req[]>([]);
  const [showDecided, setShowDecided] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch(api, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (!j.error) { setPending(j.pending); setDecided(j.decided); } }).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const act = async (id: number, action: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    const r = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? '처리하지 못했습니다.');
    load();
    onChanged?.();
  };
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const storeShort = (id: string) => STORES.find((s) => s.id === id)?.short ?? id;
  const row = (r: Req) => (
    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body">
      <span className="text-caption text-muted-foreground">{storeShort(r.store)}</span>
      <span>{nameOf.get(r.requesterId)} <span className="tabular">{fmtMd(r.requesterDate)}</span> → {nameOf.get(r.targetId)}{r.targetDate ? <> <span className="tabular">{fmtMd(r.targetDate)}</span>와 맞바꾸기</> : ' 대신 근무'}</span>
      {r.note && <span className="text-caption text-muted-foreground">{r.note}</span>}
      {r.status === 'pending' ? (
        <span className="ml-auto flex gap-2">
          <button type="button" className="ta-btn" disabled={busy} onClick={() => act(r.id, 'approve')}>승인</button>
          <button type="button" className="ta-btn" disabled={busy} onClick={() => act(r.id, 'reject')}>반려</button>
        </span>
      ) : (
        <span className={`ml-auto text-caption ${r.status === 'approved' ? 'text-emerald-600' : 'text-muted-foreground'}`}>{r.status === 'approved' ? '승인' : '반려'}{r.decidedAt && ` · ${r.decidedAt.slice(5, 10).replace('-', '/')}`}</span>
      )}
    </li>
  );
  return (
    <div>
      <p className="m-0 text-caption text-muted-foreground">직원 링크에서 보낸 요청. 승인하면 그날 계획 근무의 사람이 바뀌고, 배포된 주면 '다시 배포'가 필요합니다.</p>
      {error && <p className="m-0 mt-2 text-body text-destructive">{error}</p>}
      <ul className="m-0 mt-2 list-none divide-y divide-border p-0">
        {pending.length === 0 && <li className="py-2 text-body text-muted-foreground">대기 중인 요청이 없습니다.</li>}
        {pending.map(row)}
      </ul>
      {decided.length > 0 && (
        <>
          <button type="button" className="mt-2 text-caption text-muted-foreground underline underline-offset-2" onClick={() => setShowDecided(!showDecided)}>처리된 요청 {decided.length}건 {showDecided ? '접기' : '보기'}</button>
          {showDecided && <ul className="m-0 mt-1 list-none divide-y divide-border p-0">{decided.map(row)}</ul>}
        </>
      )}
    </div>
  );
}
