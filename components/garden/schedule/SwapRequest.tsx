'use client';

import { useEffect, useState } from 'react';
import { fmtMd } from '@/lib/teaching/kst';
import type { Shift } from '@/lib/schedule/types';

// 직원 링크의 교대 요청 — 내 근무일을 동료에게 넘기거나(대신 근무) 동료 근무일과 맞바꾼다. 운영진 승인 뒤 근무표가 바뀐다.
type Req = { id: number; requester: string; requesterDate: string; target: string; targetDate: string | null; status: 'pending' | 'approved' | 'rejected' };
const STATUS = { pending: '대기', approved: '승인됨', rejected: '반려' };

export default function SwapRequest({ token, people, shifts, today }: { token: string; people: { id: number; name: string }[]; shifts: Shift[]; today: string }) {
  const [me, setMe] = useState('');
  const [myDate, setMyDate] = useState('');
  const [other, setOther] = useState('');
  const [otherDate, setOtherDate] = useState('');
  const [note, setNote] = useState('');
  const [list, setList] = useState<Req[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/schedule-link/swap?token=${encodeURIComponent(token)}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => setList(j.requests ?? [])).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const datesOf = (id: string) => Array.from(new Set(shifts.filter((s) => s.staffId === Number(id) && s.start != null && s.date >= today).map((s) => s.date))).sort();

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch('/api/schedule-link/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, requesterId: Number(me), requesterDate: myDate, targetId: Number(other), targetDate: otherDate || null, note }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? '보내지 못했습니다.');
    setDone(true);
    setMyDate('');
    setOtherDate('');
    setNote('');
    load();
  };

  return (
    <details className="ta-panel">
      <summary className="cursor-pointer text-body">근무 바꾸기 요청 ›</summary>
      <div className="mt-3 space-y-3">
        <p className="m-0 text-caption text-muted-foreground">내 근무일을 동료에게 부탁하거나 동료 근무일과 맞바꿉니다. 운영진이 승인해야 근무표가 바뀝니다. 이번 주 배포된 근무만 고를 수 있습니다.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="내 이름" className="ta-input w-[130px]" value={me} onChange={(e) => { setMe(e.target.value); setMyDate(''); }}>
            <option value="">내 이름</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="내 근무일" className="ta-input w-[130px]" value={myDate} disabled={!me} onChange={(e) => setMyDate(e.target.value)}>
            <option value="">내 근무일</option>
            {datesOf(me).map((d) => <option key={d} value={d}>{fmtMd(d)}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="동료" className="ta-input w-[130px]" value={other} onChange={(e) => { setOther(e.target.value); setOtherDate(''); }}>
            <option value="">동료</option>
            {people.filter((p) => String(p.id) !== me).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="동료 근무일" className="ta-input w-[150px]" value={otherDate} disabled={!other} onChange={(e) => setOtherDate(e.target.value)}>
            <option value="">대신 근무 부탁(맞바꾸지 않음)</option>
            {datesOf(other).map((d) => <option key={d} value={d}>{fmtMd(d)}와 맞바꾸기</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="사유" className="ta-input min-w-[160px] flex-1" placeholder="사유(선택)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="ta-btn-primary" disabled={busy || !me || !myDate || !other} onClick={submit}>요청 보내기</button>
        </div>
        {error && <p className="m-0 text-body text-destructive">{error}</p>}
        {done && <p className="m-0 text-body text-emerald-600">보냈습니다. 운영진이 확인하면 근무표가 바뀝니다.</p>}
        {list.length > 0 && (
          <ul className="m-0 list-none space-y-1 p-0 text-caption">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-2">
                <span>{r.requester} {fmtMd(r.requesterDate)} → {r.target}{r.targetDate ? ` ${fmtMd(r.targetDate)}와 맞바꾸기` : ' 대신 근무'}</span>
                <span className={r.status === 'approved' ? 'text-emerald-600' : r.status === 'rejected' ? 'text-muted-foreground' : 'text-amber-600'}>{STATUS[r.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
