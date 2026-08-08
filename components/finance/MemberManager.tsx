'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Member {
  id: string;
  email: string;
  role: string | null;
  can_confirm: boolean;
  brand_scope: string | null; // null = 전체 | 'staffmeal' | 'garden'
}

const ROLES = [
  { value: '', label: '대기(권한 없음)' },
  { value: 'viewer', label: '조회 (집계만)' },
  { value: 'classifier', label: '분류 (업로드·분류)' },
  { value: 'admin', label: '관리자 (전체)' },
];

// 브랜드 스코프 — RLS 로 강제되는 데이터 범위. admin 은 항상 전체.
const SCOPES = [
  { value: '', label: '전체 브랜드' },
  { value: 'staffmeal', label: '스탭밀만' },
  { value: 'garden', label: '가든서비스만' },
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
    <div className="flex flex-col gap-12">
      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}

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
      <h2 className="mb-[10px] text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{title}</h2>
      <div className="overflow-hidden rounded-md border border-border bg-background">
        {isEmpty ? (
          <div className="px-5 py-[18px] text-[13px] text-muted-foreground">{empty}</div>
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
      className={`flex flex-wrap items-center gap-4 border-t border-border px-5 py-6 first:border-t-0 hover:bg-accent ${highlight ? 'bg-muted' : ''}`}
    >
      <div className="min-w-0 flex-[1_1_200px]">
        <div className="break-all text-[13px] text-foreground">{m.email}</div>
      </div>

      <select
        value={m.role ?? ''}
        disabled={saving}
        onChange={(e) => {
          const role = e.target.value || null;
          // admin 은 항상 전체 브랜드 — 스코프가 남아 있으면 함께 해제
          onPatch(m.id, role === 'admin' && m.brand_scope ? { role, brand_scope: null } : { role });
        }}
        className="ta-input text-[13px]"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <select
        value={m.brand_scope ?? ''}
        disabled={saving || !m.role || m.role === 'admin'}
        onChange={(e) => onPatch(m.id, { brand_scope: e.target.value || null })}
        className="ta-input text-[13px]"
        title="데이터 범위 — 스코프를 두면 해당 브랜드 거래만 보이고 분류할 수 있어요 (RLS 강제)"
      >
        {SCOPES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-[6px] text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={m.can_confirm}
          disabled={saving || m.role !== 'admin'}
          onChange={(e) => onPatch(m.id, { can_confirm: e.target.checked })}
        />
        월 확정 권한
      </label>

      {saving && <span className="text-[11px] text-muted-foreground">저장 중…</span>}
    </div>
  );
}
