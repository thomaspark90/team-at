'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtMin } from '@/lib/schedule/time';

// 출퇴근 화면(태블릿) — 이름을 누르고 출근/퇴근. 지금 출근 중인 사람이 위에 보인다.
type Person = { id: number; name: string; in: string | null; done: boolean };

export default function ClockBoard({ token }: { token: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [today, setToday] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch(`/api/schedule-link/clock?token=${encodeURIComponent(token)}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (!j.error) { setPeople(j.people); setToday(j.today); } }).catch(() => {});
  }, [token]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (kind: 'in' | 'out') => {
    if (sel == null) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    const r = await fetch('/api/schedule-link/clock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, staffId: sel, kind }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? '기록하지 못했습니다.');
    const name = people.find((p) => p.id === sel)?.name;
    setMsg(kind === 'in' ? `${name} 출근 ${j.at}` : `${name} 퇴근 ${j.at}${j.segment ? ` · 실제 근무 ${fmtMin(j.segment.start)}–${fmtMin(j.segment.end)} 기록` : ''}`);
    setSel(null);
    load();
  };
  const me = people.find((p) => p.id === sel);
  const working = people.filter((p) => p.in);

  return (
    <div className="space-y-6">
      {working.length > 0 && (
        <p className="m-0 text-body text-muted-foreground">출근 중: {working.map((p) => `${p.name} ${p.in}`).join(' · ')}</p>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={sel === p.id}
            className={`ta-btn min-h-[56px] text-body ${sel === p.id ? 'ta-seg-on' : ''} ${p.in ? 'text-emerald-600' : p.done ? 'text-muted-foreground' : ''}`}
            onClick={() => setSel(p.id)}
          >
            {p.name}
            {p.in && <span className="block text-caption">출근 {p.in}</span>}
            {p.done && !p.in && <span className="block text-caption">퇴근함</span>}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="ta-btn-primary min-h-[56px] flex-1 text-title" disabled={busy || !me || !!me.in} onClick={() => act('in')}>출근</button>
        <button type="button" className="ta-btn min-h-[56px] flex-1 text-title" disabled={busy || !me || !me.in} onClick={() => act('out')}>퇴근</button>
      </div>
      {msg && <p className="m-0 text-body text-emerald-600">{msg}</p>}
      {error && <p className="m-0 text-body text-destructive">{error}</p>}
      <p className="m-0 text-caption text-muted-foreground">{today} · 퇴근을 누르면 30분 단위로 반올림한 실제 근무가 기록됩니다. 잘못 눌렀으면 운영진에게 말해 주세요.</p>
    </div>
  );
}
