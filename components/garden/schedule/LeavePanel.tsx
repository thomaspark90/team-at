'use client';

import { useCallback, useEffect, useState } from 'react';
import { kstToday } from '@/lib/teaching/kst';
import { leaveRemaining, substituteBalance } from '@/lib/schedule/time';
import { LEAVE_LABEL, type LeaveType, type Staff } from '@/lib/schedule/types';

// 연차·휴무 — 총 연차는 입력값(자동 계산 없음), 잔여와 대체 잔여만 계산한다.
type Balance = { staffId: number; total: number; asOf: string };
type Rec = { id: number; staffId: number; date: string; type: LeaveType; note: string; source: 'app' | 'sheet' };

const api = '/api/garden-schedule/leave';
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function LeavePanel({ staff }: { staff: Staff[] }) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [records, setRecords] = useState<Rec[]>([]);
  const [form, setForm] = useState({ staffId: '', date: kstToday(), type: 'annual' as LeaveType, note: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(api, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setError(j.error);
        setBalances(j.balances);
        setRecords(j.records);
      })
      .catch(() => setError('불러오지 못했습니다.'));
  }, []);
  useEffect(load, [load]);

  const send = async (method: string, body: unknown) => {
    setError(null);
    const r = await fetch(api, json(method, body));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ?? '저장하지 못했습니다.');
      return false;
    }
    load();
    return true;
  };

  const active = staff.filter((s) => s.active);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send('POST', { ...form, staffId: Number(form.staffId) })) setForm({ ...form, note: '' });
        }}
      >
        <select aria-label="근무자" className="ta-input w-[140px]" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
          <option value="">근무자</option>
          {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input aria-label="날짜" type="date" className="ta-input w-[160px]" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <select aria-label="종류" className="ta-input w-[120px]" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
          {Object.entries(LEAVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input aria-label="사유" className="ta-input min-w-[140px] flex-1" placeholder="사유(선택)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button type="submit" className="ta-btn" disabled={!form.staffId}>기록</button>
      </form>
      {error && <p className="m-0 mt-2 text-body text-destructive">{error}</p>}

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="text-left text-caption text-muted-foreground">
            <th className="px-3 py-2 font-normal">이름</th>
            <th className="px-3 py-2 font-normal">총 연차(개)</th>
            <th className="px-3 py-2 font-normal">잔여 연차(개)</th>
            <th className="px-3 py-2 font-normal">대체 잔여(개)</th>
            <th className="px-3 py-2 font-normal">기록</th>
          </tr>
        </thead>
        <tbody>
          {active.map((s) => {
            const bal = balances.find((b) => b.staffId === s.id);
            const mine = records.filter((r) => r.staffId === s.id);
            const remaining = leaveRemaining(bal?.total ?? null, bal?.asOf ?? null, mine);
            const sub = substituteBalance(mine);
            return (
              <tr key={s.id} className="border-t border-border align-top text-body">
                <td className="whitespace-nowrap px-3 py-2">{nameOf.get(s.id)}</td>
                <td className="px-3 py-2">
                  <input
                    key={`${s.id}-${bal?.total ?? ''}`}
                    aria-label={`${s.name} 총 연차`}
                    type="number"
                    step="0.5"
                    min="0"
                    className="ta-input w-[80px] tabular"
                    defaultValue={bal?.total ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== String(bal?.total ?? '')) send('PUT', { staffId: s.id, total: v === '' ? null : Number(v) });
                    }}
                  />
                </td>
                <td className="px-3 py-2 tabular">{remaining ?? '–'}</td>
                <td className="px-3 py-2 tabular">{sub || '–'}</td>
                <td className="px-3 py-2">
                  {mine.map((r) => (
                    <span key={r.id} className="mr-3 inline-block text-caption text-muted-foreground">
                      {r.date.slice(5).replace('-', '/')} {LEAVE_LABEL[r.type]}
                      {r.note && `(${r.note})`}
                      {r.source === 'sheet' && ' · 시트 이관'}
                      <button type="button" aria-label="기록 삭제" className="ml-1" onClick={() => send('DELETE', { id: r.id })}>×</button>
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
