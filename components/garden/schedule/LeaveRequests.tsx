'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtMd, kstToday } from '@/lib/teaching/kst';
import { LEAVE_LABEL, LEAVE_REQUEST_TYPES, type LeaveRequest, type LeaveType, type Staff } from '@/lib/schedule/types';

// 연차 신청 접수·승인 — 지금은 운영진이 대신 접수한다(직원 계정이 생기면 같은 목록에 직원 신청이 올라온다).
const api = '/api/garden-schedule/leave/requests';
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const STATUS_LABEL: Record<LeaveRequest['status'], string> = { pending: '대기', approved: '승인', rejected: '반려' };

export default function LeaveRequests({ staff, onChanged }: { staff: Staff[]; onChanged?: () => void }) {
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [decided, setDecided] = useState<LeaveRequest[]>([]);
  const [showDecided, setShowDecided] = useState(false);
  const [form, setForm] = useState({ staffId: '', date: kstToday(), type: 'annual' as LeaveType, note: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(api, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setError(j.error);
        setPending(j.pending);
        setDecided(j.decided);
      })
      .catch(() => setError('불러오지 못했습니다.'));
  }, []);
  useEffect(load, [load]);

  const send = async (method: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await fetch(api, json(method, body));
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409 && j.conflict && (body as { action?: string }).action === 'approve') {
      // 그날 계획 근무가 있다 — 지우고 승인할지 확인
      if (window.confirm(`그날 계획 근무 ${j.conflict}건이 들어 있습니다. 근무를 지우고 승인할까요?`)) return send(method, { ...(body as object), force: true });
      return false;
    }
    if (!r.ok) {
      setError(j.error ?? '저장하지 못했습니다.');
      return false;
    }
    load();
    onChanged?.(); // 승인은 연차 기록이 되므로 잔여 표도 다시 읽는다
    return true;
  };

  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const active = staff.filter((s) => s.active);
  const row = (r: LeaveRequest) => (
    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body">
      <span className="w-[72px]">{nameOf.get(r.staffId) ?? r.staffId}</span>
      <span className="tabular w-[72px]">{fmtMd(r.date)}</span>
      <span className="w-[48px] text-muted-foreground">{LEAVE_LABEL[r.type]}</span>
      {r.note && <span className="text-caption text-muted-foreground">{r.note}</span>}
      {r.source === 'app' && <span className="text-caption text-muted-foreground">직원 신청</span>}
      {r.status === 'pending' ? (
        <span className="ml-auto flex gap-2">
          <button type="button" className="ta-btn" disabled={busy} onClick={() => send('PATCH', { id: r.id, action: 'approve' })}>승인</button>
          <button type="button" className="ta-btn" disabled={busy} onClick={() => send('PATCH', { id: r.id, action: 'reject' })}>반려</button>
        </span>
      ) : (
        <span className={`ml-auto text-caption ${r.status === 'approved' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {STATUS_LABEL[r.status]}{r.decidedAt && ` · ${r.decidedAt.slice(5, 10).replace('-', '/')}`}
        </span>
      )}
    </li>
  );

  return (
    <div>
      <p className="ta-label">연차 신청</p>
      <p className="m-0 mb-2 text-caption text-muted-foreground">승인하면 잔여에서 빠지고 그날 계획 근무가 지워집니다. 근무가 들어 있으면 한 번 더 묻습니다.</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send('POST', { ...form, staffId: Number(form.staffId) })) setForm({ ...form, note: '' });
        }}
      >
        <select aria-label="신청자" className="ta-input w-[140px]" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
          <option value="">근무자</option>
          {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input aria-label="신청 날짜" type="date" className="ta-input w-[160px]" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <select aria-label="신청 종류" className="ta-input w-[100px]" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
          {LEAVE_REQUEST_TYPES.map((k) => <option key={k} value={k}>{LEAVE_LABEL[k]}</option>)}
        </select>
        <input aria-label="신청 사유" className="ta-input min-w-[140px] flex-1" placeholder="사유(선택)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button type="submit" className="ta-btn" disabled={busy || !form.staffId}>접수</button>
      </form>
      {error && <p className="m-0 mt-2 text-body text-destructive">{error}</p>}
      <ul className="m-0 mt-3 list-none divide-y divide-border p-0">
        {pending.length === 0 && <li className="py-2 text-body text-muted-foreground">대기 중인 신청이 없습니다.</li>}
        {pending.map(row)}
      </ul>
      {decided.length > 0 && (
        <>
          <button type="button" className="mt-2 text-caption text-muted-foreground underline underline-offset-2" onClick={() => setShowDecided(!showDecided)}>
            처리된 신청 {decided.length}건 {showDecided ? '접기' : '보기'}
          </button>
          {showDecided && <ul className="m-0 mt-1 list-none divide-y divide-border p-0">{decided.map(row)}</ul>}
        </>
      )}
    </div>
  );
}
