'use client';

import { useEffect, useState } from 'react';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GardenTodo } from '@/lib/garden-todos';
import type { GardenTopicMap } from '@/lib/garden-notify-topics';
import { GARDEN_TOPICS, EMPTY_TOPICS } from '@/lib/garden-notify-topics';
import NotifyRecipients, { type RecipientRow } from '@/components/NotifyRecipients';
import NotifySettings from '@/components/NotifySettings';

// 가든 설정 — 분쇄도 측정 요청(담당자 알림), 필터커피 투두리스트, 알림 수신자/채널 관리.

// 요청 내용 프리셋 — 캘리브레이션 운영에서 실제로 쓰는 두 가지 + 직접 입력
const PRESETS = [
  { id: 'drift', label: '드리프트 체크 — 다이얼 6.5 · 1~2샷' },
  { id: 'slope', label: '기울기 측정 — 다이얼 8.0 · 10.0 × 각 3샷' },
  { id: 'custom', label: '직접 입력' },
];

const segBtn = (active: boolean): React.CSSProperties => ({
  height: 32,
  paddingLeft: 12,
  paddingRight: 12,
  fontSize: 13,
  cursor: 'pointer',
  borderRadius: 6,
  border: '1px solid hsl(var(--border))',
  background: active ? 'hsl(var(--foreground))' : 'transparent',
  color: active ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
});

function GrindRequestForm() {
  const [stores, setStores] = useState<StoreId[]>(['pangyo']);
  const [preset, setPreset] = useState('drift');
  const [customDetail, setCustomDetail] = useState('');
  const [note, setNote] = useState('');
  const [staff, setStaff] = useState<string[]>([]); // 담당자 후보(원두 수신자)
  const [picked, setPicked] = useState<string[]>([]); // 선택된 담당자 — 비면 전체 발송
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/garden-grind-request', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { emails: [] }))
      .then((d) => setStaff(Array.isArray(d.emails) ? d.emails : []));
  }, []);

  const toggleStore = (id: StoreId) =>
    setStores((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const toggleStaff = (email: string) =>
    setPicked((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));

  const detail =
    preset === 'custom' ? customDetail.trim() : PRESETS.find((p) => p.id === preset)?.label ?? '';
  const canSend = stores.length > 0 && detail !== '' && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/garden-grind-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stores,
          detail,
          note: note.trim() || undefined,
          emails: picked.length > 0 ? picked : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '발송에 실패했어요.');
      const names = (j.sentTo as string[]).map((e) => e.split('@')[0]).join(', ');
      setResult(`✓ 발송 완료 — ${names}에게 이메일·푸시로 전달했어요.`);
      setNote('');
    } catch (e) {
      setResult(`⚠ ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p className="text-[14px] font-medium text-foreground" style={{ margin: 0 }}>분쇄도 측정 요청</p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          &lsquo;EK43 캘리브레이션 요청&rsquo; 담당자에게 이메일·앱푸시로 보냅니다. 아래에서 담당자를
          고르지 않으면 담당자 전체에게 발송돼요.
        </p>
      </div>

      {/* 지점 (복수 선택) */}
      <div style={{ display: 'flex', gap: 8 }}>
        {STORES.map((s) => (
          <button key={s.id} onClick={() => toggleStore(s.id)} style={segBtn(stores.includes(s.id))}>
            {s.label}
          </button>
        ))}
      </div>

      {/* 요청 내용 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => setPreset(p.id)} style={segBtn(preset === p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <input
          type="text"
          value={customDetail}
          onChange={(e) => setCustomDetail(e.target.value)}
          placeholder="요청 내용 (예: 다이얼 7.0 3샷 측정)"
          className="ta-input"
        />
      )}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모 (선택 — 예: 이번 주 안에 부탁해요)"
        className="ta-input"
      />

      {/* 담당자 선택 */}
      {staff.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="text-[12px] text-muted-foreground">담당자 (선택 안 하면 전체 발송)</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {staff.map((email) => (
              <button key={email} onClick={() => toggleStaff(email)} style={segBtn(picked.includes(email))}>
                {email.split('@')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={send} disabled={!canSend} className="ta-btn-primary" style={{ height: 36, opacity: canSend ? 1 : 0.5 }}>
        {sending ? '발송 중…' : '측정 요청 보내기'}
      </button>
      {result && <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>{result}</p>}
    </div>
  );
}

// 항목별 알림 담당자 — 토픽마다 이메일 칩으로 지정. 담당자가 푸시를 켜면 기기 알림으로 수신.
function TopicAssignees() {
  const [map, setMap] = useState<GardenTopicMap>(EMPTY_TOPICS);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/garden-notify-topics', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : EMPTY_TOPICS))
      .then((d) => setMap({ ...EMPTY_TOPICS, ...d }));
  }, []);

  const save = async (topic: string, emails: string[]) => {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/garden-notify-topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, emails }),
    });
    if (res.ok) setMap({ ...EMPTY_TOPICS, ...(await res.json()) });
    else setError((await res.json().catch(() => null))?.error ?? '저장에 실패했어요.');
    setBusy(false);
  };

  const add = (topic: keyof GardenTopicMap) => {
    const email = (inputs[topic] ?? '').trim().toLowerCase();
    if (!email || busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('올바른 이메일을 입력하세요.');
      return;
    }
    setInputs((p) => ({ ...p, [topic]: '' }));
    save(topic, Array.from(new Set([...map[topic], email])));
  };
  const remove = (topic: keyof GardenTopicMap, email: string) =>
    save(topic, map[topic].filter((e) => e !== email));

  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p className="text-[14px] font-medium text-foreground" style={{ margin: 0 }}>알림 담당자 설정 (항목별)</p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          항목마다 담당자를 지정하면 해당 이벤트가 <strong>이메일 + 앱푸시</strong>로 전달됩니다.
          담당자는 아래 &lsquo;내 알림 채널&rsquo;에서 푸시를 켜야 기기 알림을 받아요. 레시피
          등록/수정은 담당자 미지정 시 알림이 나가지 않고, 요청류(캘리브레이션·원두카드)는 미지정 시
          원두 알림 수신자 전체에게 발송됩니다.
        </p>
      </div>
      {GARDEN_TOPICS.map((t) => (
        <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="text-[13px] font-medium text-foreground">{t.label}</span>
            <span className="text-[11px] text-muted-foreground">{t.desc}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {map[t.id].map((email) => (
              <span key={email} className="rounded-full border border-border text-[12px] text-foreground" style={{ padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {email.split('@')[0]}
                <button onClick={() => remove(t.id, email)} disabled={busy} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }} title={`${email} 제거`}>
                  ×
                </button>
              </span>
            ))}
            <input
              type="email"
              value={inputs[t.id] ?? ''}
              onChange={(e) => setInputs((p) => ({ ...p, [t.id]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && add(t.id)}
              placeholder="이메일 추가"
              className="ta-input"
              style={{ height: 30, width: 190, fontSize: 12 }}
            />
            <button onClick={() => add(t.id)} disabled={busy || !(inputs[t.id] ?? '').trim()} className="ta-btn" style={{ height: 30, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}>
              추가
            </button>
          </div>
        </div>
      ))}
      {error && <p className="text-[12px]" style={{ margin: 0, color: 'hsl(0 72% 45%)' }}>{error}</p>}
    </div>
  );
}

// 원두카드 제작 요청 — beanCard 토픽 담당자에게 이메일+앱푸시
function BeanCardRequestForm() {
  const [bean, setBean] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const send = async () => {
    if (!bean.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/garden-beancard-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bean: bean.trim(), note: note.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '발송에 실패했어요.');
      const names = (j.sentTo as string[]).map((e) => e.split('@')[0]).join(', ');
      setResult(`✓ 발송 완료 — ${names}에게 전달했어요.`);
      setBean('');
      setNote('');
    } catch (e) {
      setResult(`⚠ ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p className="text-[14px] font-medium text-foreground" style={{ margin: 0 }}>원두카드 제작 요청</p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          &lsquo;원두카드 제작 요청&rsquo; 담당자에게 이메일·앱푸시로 전달됩니다.
        </p>
      </div>
      <input type="text" value={bean} onChange={(e) => setBean(e.target.value)} placeholder="원두명 (예: 페루 게이샤)" className="ta-input" />
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택 — 예: 신메뉴 출시 전까지)" className="ta-input" />
      <button onClick={send} disabled={!bean.trim() || sending} className="ta-btn-primary" style={{ height: 36, opacity: !bean.trim() || sending ? 0.5 : 1 }}>
        {sending ? '발송 중…' : '제작 요청 보내기'}
      </button>
      {result && <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>{result}</p>}
    </div>
  );
}

function TodoList() {
  const [todos, setTodos] = useState<GardenTodo[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/garden-todos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTodos(Array.isArray(d) ? d : []));
  }, []);

  const call = async (init: RequestInit, url = '/api/garden-todos') => {
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
    call({ method: 'DELETE' }, `/api/garden-todos?id=${t.id}`);
  };

  const fmt = (iso?: string) => (iso ? iso.slice(5, 10).replace('-', '.') : '');

  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p className="text-[14px] font-medium text-foreground" style={{ margin: 0 }}>필터커피 투두리스트</p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          측정·검증·레시피 등 필터커피 관련 할 일을 팀이 함께 봅니다.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="할 일 추가 (예: 판교 8.0·10.0 측정 결과 업로드)"
          className="ta-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button onClick={add} disabled={busy || input.trim() === ''} className="ta-btn-primary" style={{ height: 36, paddingLeft: 14, paddingRight: 14 }}>
          추가
        </button>
      </div>
      {todos.length === 0 ? (
        <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>아직 할 일이 없어요.</p>
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
              <button onClick={() => remove(t)} disabled={busy} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0 }} title="삭제">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GardenSettings() {
  // 알림 수신자 관리는 admin 전용 — 403이면 섹션 숨김
  const [recipients, setRecipients] = useState<RecipientRow[] | null>(null);

  useEffect(() => {
    fetch('/api/notify/recipients', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRecipients(j?.recipients ?? null))
      .catch(() => setRecipients(null));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <TopicAssignees />
      <GrindRequestForm />
      <BeanCardRequestForm />
      <TodoList />
      {recipients && <NotifyRecipients initial={recipients} />}
      {/* 내 알림 채널(이메일·웹푸시) — 푸시를 켜야 담당자 알림을 기기에서 받는다 */}
      <NotifySettings />
    </div>
  );
}
