'use client';

import { useEffect, useState } from 'react';
import type { GardenTodo } from '@/lib/garden-todos';

// 팀 투두리스트 — 가든 설정과 스탭밀 설정이 API 경로·문구만 다르게 공유한다.
// (원래 GardenSettings 안에 있던 것을 스탭밀 투두 신설로 공용 컴포넌트로 분리)

export default function TodoList({
  api,
  title,
  desc,
  placeholder,
}: {
  api: string; // '/api/garden-todos' | '/api/staffmeal-todos'
  title: string;
  desc: string;
  placeholder: string;
}) {
  const [todos, setTodos] = useState<GardenTodo[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(api, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTodos(Array.isArray(d) ? d : []));
  }, [api]);

  const call = async (init: RequestInit, url = api) => {
    setBusy(true);
    const res = await fetch(url, init);
    if (res.ok) setTodos(await res.json());
    setBusy(false);
  };

  const add = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  };
  const toggle = (t: GardenTodo) =>
    call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, done: !t.done }) });
  const remove = (t: GardenTodo) => {
    if (!confirm(`'${t.text}' 항목을 삭제할까요?`)) return;
    call({ method: 'DELETE' }, `${api}?id=${t.id}`);
  };

  const fmt = (iso?: string) => (iso ? iso.slice(5, 10).replace('-', '.') : '');

  return (
    <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p className="text-[15px] font-medium text-foreground" style={{ margin: 0 }}>{title}</p>
        <p className="text-[13px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          {desc}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="ta-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button onClick={add} disabled={busy || input.trim() === ''} className="ta-btn-primary" style={{ height: 36, paddingLeft: 14, paddingRight: 14 }}>
          추가
        </button>
      </div>
      {todos.length === 0 ? (
        <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>아직 할 일이 없어요.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {todos.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} disabled={busy} style={{ cursor: 'pointer', flexShrink: 0 }} />
              <span
                className={`text-[13px] ${t.done ? 'text-muted-foreground' : 'text-foreground'}`}
                style={{ minWidth: 0, flex: 1, textDecoration: t.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {t.text}
              </span>
              <span className="tabular text-[11px] text-muted-foreground" style={{ flexShrink: 0 }}>
                {t.done ? `${fmt(t.doneAt)} 완료${t.doneBy ? ` · ${t.doneBy.split('@')[0]}` : ''}` : `${fmt(t.createdAt)}${t.createdBy ? ` · ${t.createdBy.split('@')[0]}` : ''}`}
              </span>
              <button onClick={() => remove(t)} disabled={busy} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0 }} title="삭제">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
