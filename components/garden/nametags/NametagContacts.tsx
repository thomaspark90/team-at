'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/components/Toast';
import type { NametagContact } from '@/lib/garden/nametags';
import { ACT_SUB, API, FIELD, call, failed, jsonInit } from './shared';

// 네임택 담당자 이름·연락처 입력(가든 설정) — 스탭이 요청할 때 '받는 사람'으로 보인다.
// assignees 가 바뀌면(담당자 추가·제거) 목록을 다시 읽는다. 권한이 없으면 아무것도 그리지 않는다.

export default function NametagContacts({ assignees }: { assignees: string[] }) {
  const [contacts, setContacts] = useState<NametagContact[] | null>(null);
  const key = assignees.join(',');

  useEffect(() => {
    call<{ contacts: NametagContact[] }>(`${API}/contacts`).then((j) => setContacts(failed(j) ? null : j.contacts));
  }, [key]);

  if (!contacts || contacts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <p className="m-0 text-body font-medium text-foreground">네임택 담당자 이름·연락처</p>
        <p className="m-0 text-caption text-muted-foreground">스탭이 네임택 프린트를 요청할 때 누구에게 갔는지 이 이름과 번호로 보입니다.</p>
      </div>
      {contacts.map((c) => (
        <Row key={c.email} contact={c} onSaved={setContacts} />
      ))}
    </div>
  );
}

function Row({ contact, onSaved }: { contact: NametagContact; onSaved: (c: NametagContact[]) => void }) {
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [saving, setSaving] = useState(false);
  const dirty = name !== contact.name || phone !== contact.phone;

  const save = async () => {
    setSaving(true);
    const j = await call<{ contacts: NametagContact[] }>(`${API}/contacts`, jsonInit('PUT', { email: contact.email, name, phone }));
    setSaving(false);
    if (failed(j)) return toast(j.error, 'error');
    onSaved(j.contacts);
    toast('저장했어요');
  };

  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
      <span className="w-40 truncate text-caption text-muted-foreground" title={contact.email}>
        {contact.email}
      </span>
      <input className={`${FIELD} w-32`} placeholder="이름" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} aria-label={`${contact.email} 이름`} />
      <input className={`${FIELD} w-40`} placeholder="전화번호" value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value)} aria-label={`${contact.email} 전화번호`} />
      <button type="button" className={ACT_SUB} disabled={!dirty || saving} onClick={save}>
        {saving ? '저장 중' : '저장'}
      </button>
    </div>
  );
}
