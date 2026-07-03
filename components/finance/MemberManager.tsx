'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Member {
  id: string;
  email: string;
  role: string | null;
  can_confirm: boolean;
}

const ROLES = [
  { value: '', label: '대기(권한 없음)' },
  { value: 'viewer', label: '조회 (집계만)' },
  { value: 'classifier', label: '분류 (업로드·분류)' },
  { value: 'admin', label: '관리자 (전체)' },
];

export default function MemberManager({ initial }: { initial: Member[] }) {
  const [members, setMembers] = useState<Member[]>(initial);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, change: Partial<Member>) {
    setSavingId(id);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.schema('finance').from('members').update(change).eq('id', id);
    if (error) setError(error.message);
    else setMembers((list) => list.map((m) => (m.id === id ? { ...m, ...change } : m)));
    setSavingId(null);
  }

  const pending = members.filter((m) => !m.role);
  const active = members.filter((m) => m.role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && <div style={{ color: '#b23b3b', fontSize: 13 }}>⚠️ {error}</div>}

      <Section title={`승인 대기 (${pending.length})`} empty="대기 중인 요청이 없어요.">
        {pending.map((m) => (
          <Row key={m.id} m={m} saving={savingId === m.id} onPatch={patch} highlight />
        ))}
      </Section>

      <Section title={`멤버 (${active.length})`} empty="아직 멤버가 없어요.">
        {active.map((m) => (
          <Row key={m.id} m={m} saving={savingId === m.id} onPatch={patch} />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.filter(Boolean).length === 0;
  return (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: '#444' }}>{title}</h2>
      <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, overflow: 'hidden' }}>
        {isEmpty ? (
          <div style={{ padding: '18px 20px', fontSize: 13, color: '#999' }}>{empty}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Row({
  m,
  saving,
  onPatch,
  highlight,
}: {
  m: Member;
  saving: boolean;
  onPatch: (id: string, change: Partial<Member>) => void;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 20px',
        borderTop: '1px solid #F0F0F0',
        background: highlight ? '#FFFBEB' : '#fff',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>{m.email}</div>
      </div>

      <select
        value={m.role ?? ''}
        disabled={saving}
        onChange={(e) => onPatch(m.id, { role: e.target.value || null })}
        style={{
          fontSize: 13,
          padding: '7px 10px',
          borderRadius: 8,
          border: '1px solid #DDD',
          fontFamily: 'inherit',
          background: '#fff',
        }}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={m.can_confirm}
          disabled={saving || m.role !== 'admin'}
          onChange={(e) => onPatch(m.id, { can_confirm: e.target.checked })}
        />
        월 확정 권한
      </label>

      {saving && <span style={{ fontSize: 12, color: '#999' }}>저장 중…</span>}
    </div>
  );
}
