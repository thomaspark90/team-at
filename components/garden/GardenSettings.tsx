'use client';

import { useEffect, useState } from 'react';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GardenTodo } from '@/lib/garden-todos';
import type { GardenTopicMap, GardenTopicId } from '@/lib/garden-notify-topics';
import { EMPTY_TOPICS, topicsOfScope } from '@/lib/garden-notify-topics';
import { type RecipientRow } from '@/components/NotifyRecipients';
import NotifySettings from '@/components/NotifySettings';
import GardenOptionsManager from '@/components/garden/GardenOptionsManager';
import GardenTabAccess from '@/components/garden/GardenTabAccess';

// 가든 설정 — 알림(내 채널 + 항목별 담당자), 요청 보내기, 발주 명단, 접근 권한, 투두리스트.
// 흩어져 있던 알림 3종(항목별 담당자·수신자 관리·내 채널)과 요청 폼 2종을 각각 하나로 합쳤다.

// 요청 내용 프리셋 — 캘리브레이션 운영에서 실제로 쓰는 것 + 직접 입력
const PRESETS = [
  { id: 'slope', label: '기울기 측정 — 다이얼 6 · 8 · 10 × 각 3샷' },
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

const chip: React.CSSProperties = {
  padding: '3px 10px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ───────────────────────── 알림 (내 채널 + 항목별 담당자) ─────────────────────────

// 재무 쪽 수신자(송금·재고)는 저장 위치가 달라 별도 API 를 쓰지만, 화면에서는 가든 항목과
// 같은 '항목별 담당자' 표에 함께 보여준다 — 사용자 입장에선 똑같이 "누가 이 알림을 받나"다.
type FinanceTopic = 'transfer' | 'stock';
const FINANCE_TOPICS: { id: FinanceTopic; label: string; desc: string }[] = [
  { id: 'transfer', label: '송금 요청', desc: '새 송금 요청이 등록되면 알림' },
  { id: 'stock', label: '원두 재고', desc: '재고 20%·소진 시 알림' },
];

function NotificationCenter({ recipients }: { recipients: RecipientRow[] | null }) {
  const [map, setMap] = useState<GardenTopicMap>(EMPTY_TOPICS);
  const [rows, setRows] = useState<RecipientRow[]>(recipients ?? []);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/garden-notify-topics', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : EMPTY_TOPICS))
      .then((d) => setMap({ ...EMPTY_TOPICS, ...d }));
  }, []);
  useEffect(() => {
    if (recipients) setRows(recipients);
  }, [recipients]);

  const saveGarden = async (topic: GardenTopicId, emails: string[]) => {
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

  // 재무 수신자는 사람 한 명이 여러 항목을 가지므로, 항목을 켜고 끄는 방식으로 저장한다
  const saveFinance = async (email: string, topic: FinanceTopic, on: boolean) => {
    setBusy(true);
    setError(null);
    const cur = rows.find((r) => r.email === email);
    const next = { transfer: cur?.transfer ?? false, stock: cur?.stock ?? false, [topic]: on };
    try {
      // 두 항목 모두 꺼지면 수신자 목록에서 제거해 빈 행이 남지 않게 한다
      const res =
        !next.transfer && !next.stock
          ? await fetch('/api/notify/recipients', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            })
          : await fetch('/api/notify/recipients', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, ...next }),
            });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      setRows(j.recipients as RecipientRow[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addTo = (key: string, add: (email: string) => void) => {
    const email = (inputs[key] ?? '').trim().toLowerCase();
    if (!email || busy) return;
    if (!EMAIL_RE.test(email)) {
      setError('올바른 이메일을 입력하세요.');
      return;
    }
    setInputs((p) => ({ ...p, [key]: '' }));
    add(email);
  };

  // 렌더 함수로 호출한다(<AddInput/> 처럼 컴포넌트로 쓰면 매 입력마다 새 타입이 되어
  // input 이 리마운트되고 포커스가 날아간다)
  const addInput = (k: string, onAdd: (email: string) => void) => (
    <>
      <input
        type="email"
        value={inputs[k] ?? ''}
        onChange={(e) => setInputs((p) => ({ ...p, [k]: e.target.value }))}
        onKeyDown={(e) => e.key === 'Enter' && addTo(k, onAdd)}
        placeholder="이메일 추가"
        className="ta-input"
        style={{ height: 30, width: 190, fontSize: 12 }}
      />
      <button
        onClick={() => addTo(k, onAdd)}
        disabled={busy || !(inputs[k] ?? '').trim()}
        className="ta-btn"
        style={{ height: 30, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
      >
        추가
      </button>
    </>
  );

  const row = ({
    label,
    desc,
    emails,
    k,
    onAdd,
    onRemove,
  }: {
    label: string;
    desc: string;
    emails: string[];
    k: string;
    onAdd: (email: string) => void;
    onRemove: (email: string) => void;
  }) => (
    <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{desc}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {emails.map((email) => (
          <span key={email} className="rounded-full border border-border text-[12px] text-foreground" style={chip}>
            {email.split('@')[0]}
            <button
              onClick={() => onRemove(email)}
              disabled={busy}
              className="text-muted-foreground hover:text-foreground"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}
              title={`${email} 제거`}
            >
              ×
            </button>
          </span>
        ))}
        {addInput(k, onAdd)}
      </div>
    </div>
  );

  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p className="text-[14px] font-medium text-foreground" style={{ margin: 0 }}>알림</p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          아래 <strong>내 수신 채널</strong>에서 내가 받을 방법을 켜고,{' '}
          <strong>항목별 담당자</strong>에서 각 알림을 누가 받을지 지정합니다. 담당자로 지정돼도 본인이
          푸시를 켜야 기기 알림이 옵니다.
        </p>
      </div>

      <div>
        <p className="ta-label" style={{ margin: '0 0 6px' }}>내 수신 채널</p>
        <NotifySettings bare />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="ta-label" style={{ margin: 0 }}>항목별 담당자</p>
        {/* 가든 항목만 — 스탭밀 항목은 /studio/settings 에서 관리한다 */}
        {topicsOfScope('garden').map((t) =>
          row({
            label: t.label,
            desc: t.desc,
            emails: map[t.id],
            k: t.id,
            onAdd: (email) => saveGarden(t.id, Array.from(new Set([...map[t.id], email]))),
            onRemove: (email) => saveGarden(t.id, map[t.id].filter((e) => e !== email)),
          })
        )}
        {/* 송금·재고는 관리자만 편집 가능(수신자 API가 admin 전용) */}
        {recipients &&
          FINANCE_TOPICS.map((t) =>
            row({
              label: t.label,
              desc: t.desc,
              emails: rows.filter((r) => r[t.id]).map((r) => r.email),
              k: t.id,
              onAdd: (email) => saveFinance(email, t.id, true),
              onRemove: (email) => saveFinance(email, t.id, false),
            })
          )}
      </div>
      <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>
        담당자를 지정하지 않으면 요청류·이슈 리뷰·측정 업로드 알림은 원두 알림
        수신자 전체에게 발송됩니다. 레시피 등록·수정만 담당자 지정 시에 발송됩니다(옵트인).
      </p>
      {error && <p className="text-[12px]" style={{ margin: 0, color: 'hsl(0 72% 45%)' }}>{error}</p>}
    </div>
  );
}

// ───────────────────────── 요청 보내기 (분쇄도 측정 · 원두카드) ─────────────────────────

type RequestKind = 'grind' | 'beancard';

function RequestForms() {
  const [kind, setKind] = useState<RequestKind>('grind');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // 분쇄도 측정
  const [stores, setStores] = useState<StoreId[]>(['pangyo']);
  const [preset, setPreset] = useState('slope');
  const [customDetail, setCustomDetail] = useState('');
  const [staff, setStaff] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  // 원두카드
  const [bean, setBean] = useState('');

  useEffect(() => {
    fetch('/api/garden-grind-request', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { emails: [] }))
      .then((d) => setStaff(Array.isArray(d.emails) ? d.emails : []));
  }, []);

  const toggleStore = (id: StoreId) =>
    setStores((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const toggleStaff = (email: string) =>
    setPicked((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));

  const detail = preset === 'custom' ? customDetail.trim() : PRESETS.find((p) => p.id === preset)?.label ?? '';
  const canSend =
    !sending && (kind === 'grind' ? stores.length > 0 && detail !== '' : bean.trim() !== '');

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const [url, body] =
        kind === 'grind'
          ? [
              '/api/garden-grind-request',
              { stores, detail, note: note.trim() || undefined, emails: picked.length > 0 ? picked : undefined },
            ]
          : ['/api/garden-beancard-request', { bean: bean.trim(), note: note.trim() || undefined }];
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '발송에 실패했어요.');
      const names = (j.sentTo as string[]).map((e) => e.split('@')[0]).join(', ');
      setResult(`✓ 발송 완료 — ${names}에게 이메일·푸시로 전달했어요.`);
      setNote('');
      if (kind === 'beancard') setBean('');
    } catch (e) {
      setResult(`⚠ ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const switchKind = (k: RequestKind) => {
    setKind(k);
    setResult(null);
  };

  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p className="text-[14px] font-medium text-foreground" style={{ margin: 0 }}>요청 보내기</p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          해당 항목의 담당자에게 이메일·앱푸시로 전달됩니다. 담당자가 지정되지 않았으면 원두 알림
          수신자 전체에게 발송돼요.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => switchKind('grind')} style={segBtn(kind === 'grind')}>분쇄도 측정</button>
        <button onClick={() => switchKind('beancard')} style={segBtn(kind === 'beancard')}>원두카드 제작</button>
      </div>

      {kind === 'grind' ? (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            {STORES.map((s) => (
              <button key={s.id} onClick={() => toggleStore(s.id)} style={segBtn(stores.includes(s.id))}>
                {s.label}
              </button>
            ))}
          </div>
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
        </>
      ) : (
        <input
          type="text"
          value={bean}
          onChange={(e) => setBean(e.target.value)}
          placeholder="원두명 (예: 페루 게이샤)"
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

      {kind === 'grind' && staff.length > 0 && (
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
        {sending ? '발송 중…' : '요청 보내기'}
      </button>
      {result && <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>{result}</p>}
    </div>
  );
}

// ───────────────────────── 투두리스트 ─────────────────────────

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
          placeholder="할 일 추가 (예: 판교 6·8·10 측정 결과 업로드)"
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
  // 알림 수신자·페이지 권한은 admin 전용 — 403이면 해당 부분을 숨긴다
  const [recipients, setRecipients] = useState<RecipientRow[] | null>(null);
  const [tabUsers, setTabUsers] = useState<
    { id: string; email: string; tabs: string[] | null; sections: string[] | null }[] | null
  >(null);

  useEffect(() => {
    fetch('/api/notify/recipients', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRecipients(j?.recipients ?? null))
      .catch(() => setRecipients(null));
    fetch('/api/garden-tab-access', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setTabUsers(j?.isAdmin && Array.isArray(j.users) ? j.users : null))
      .catch(() => setTabUsers(null));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <NotificationCenter recipients={recipients} />
      <RequestForms />
      {/* 필터 원두 발주의 스탭이름·로스팅사 드롭다운 명단 */}
      <GardenOptionsManager />
      {/* 계정별 페이지 접근 권한(상위 메뉴 + 가든 하위 탭) — admin 전용 */}
      {tabUsers && <GardenTabAccess initial={tabUsers} />}
      <TodoList />
    </div>
  );
}
