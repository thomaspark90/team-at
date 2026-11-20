'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/components/Toast';
import { useTeamEmails } from '@/components/EmailAddPicker';
import { contactName, type NametagContact } from '@/lib/garden/nametags';
import { ACT_SUB, API, FIELD, call, failed, jsonInit } from './shared';

// 받는 사람 등록·편집 — 요청 확인 패널의 [···] 로 연다(2026-11-20 대표 지시).
// 한 줄 = 한 사람(이름·전화번호 고치기, 빼기). 맨 아래에서 팀 계정을 고르거나 이메일을 적어 새로 등록한다.
// 아무도 등록돼 있지 않으면 지금 받는 사람은 폴백(원두 알림 수신자)이라 '빼기'가 없다 — 등록하면 그 사람에게만 간다.

type State = { recipients: NametagContact[]; assigned: string[] };
const URL_ = `${API}/recipients`;
const TYPED = '_typed';

export default function RecipientEditor({ onChanged }: { onChanged: (recipients: NametagContact[]) => void }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (j: State | { error: string }) => {
    if (failed(j)) return toast(j.error, 'error'), false;
    setState(j);
    onChanged(j.recipients);
    return true;
  };
  const run = async (p: Promise<State | { error: string }>, ok: string) => {
    setBusy(true);
    const done = apply(await p);
    setBusy(false);
    if (done) toast(ok);
    return done;
  };

  useEffect(() => {
    call<State>(URL_).then((j) => (failed(j) ? toast(j.error, 'error') : setState(j)));
  }, []);

  if (!state) return <p className="m-0 text-caption text-muted-foreground">받는 사람 불러오는 중</p>;
  const fallback = state.assigned.length === 0;

  return (
    <div className="space-y-3 border-y border-border py-3">
      {fallback && state.recipients.length > 0 && (
        <p className="m-0 text-caption text-muted-foreground">
          등록된 받는 사람이 없어 지금은 원두 알림 수신자에게 갑니다. 아래에서 등록하면 등록한 사람에게만 갑니다.
        </p>
      )}
      {state.recipients.map((c) => (
        <Line
          key={c.email}
          contact={c}
          busy={busy}
          onSave={(name, phone) => run(call<State>(URL_, jsonInit('PUT', { email: c.email, name, phone })), '저장했어요')}
          onRemove={
            fallback
              ? undefined
              : () => {
                  if (!window.confirm(`${contactName(c)}님을 받는 사람에서 뺄까요?`)) return;
                  void run(call<State>(`${URL_}?email=${encodeURIComponent(c.email)}`, { method: 'DELETE' }), '받는 사람에서 뺐어요');
                }
          }
        />
      ))}
      <AddLine
        busy={busy}
        exclude={state.assigned}
        onAdd={(email, name, phone) => run(call<State>(URL_, jsonInit('PUT', { email, name, phone, add: true })), '받는 사람으로 등록했어요')}
      />
    </div>
  );
}

function Line({
  contact,
  busy,
  onSave,
  onRemove,
}: {
  contact: NametagContact;
  busy: boolean;
  onSave: (name: string, phone: string) => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const dirty = name !== contact.name || phone !== contact.phone;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <span className="w-full truncate text-caption text-muted-foreground sm:w-36" title={contact.email}>
        {contact.email}
      </span>
      <input className={`${FIELD} w-24`} placeholder="이름" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} aria-label={`${contact.email} 이름`} />
      <input className={`${FIELD} w-36`} placeholder="전화번호" value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value)} aria-label={`${contact.email} 전화번호`} />
      <button type="button" className={ACT_SUB} disabled={!dirty || busy} onClick={() => onSave(name, phone)}>
        저장
      </button>
      {onRemove && (
        <button type="button" className={ACT_SUB} disabled={busy} onClick={onRemove}>
          빼기
        </button>
      )}
    </div>
  );
}

function AddLine({ busy, exclude, onAdd }: { busy: boolean; exclude: string[]; onAdd: (email: string, name: string, phone: string) => Promise<boolean> }) {
  const team = useTeamEmails();
  const [pick, setPick] = useState('');
  const [typed, setTyped] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const taken = new Set(exclude.map((e) => e.toLowerCase()));
  const options = team.filter((e) => !taken.has(e.toLowerCase()));
  const email = (pick === TYPED ? typed : pick).trim().toLowerCase();

  const add = async () => {
    if (!(await onAdd(email, name, phone))) return;
    setPick('');
    setTyped('');
    setName('');
    setPhone('');
  };

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <select className={`${FIELD} w-full sm:w-36`} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="받는 사람 추가">
        <option value="">＋ 받는 사람 추가</option>
        {options.map((e) => (
          <option key={e} value={e}>
            {e.split('@')[0]}
          </option>
        ))}
        <option value={TYPED}>이메일 직접 입력</option>
      </select>
      {pick === TYPED && (
        <input className={`${FIELD} w-48`} placeholder="이메일" value={typed} inputMode="email" onChange={(e) => setTyped(e.target.value)} aria-label="받는 사람 이메일" />
      )}
      {pick && (
        <>
          <input className={`${FIELD} w-24`} placeholder="이름" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} aria-label="새 받는 사람 이름" />
          <input className={`${FIELD} w-36`} placeholder="전화번호" value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value)} aria-label="새 받는 사람 전화번호" />
          <button type="button" className={ACT_SUB} disabled={busy || !email.includes('@')} onClick={add}>
            등록
          </button>
        </>
      )}
    </div>
  );
}
