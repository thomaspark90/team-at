'use client';

import { useCallback, useEffect, useState } from 'react';
import { SHIFT_LABEL, type CrewPlan, type ShiftType } from '@/lib/checklist/types';
import type { StoreId } from '@/lib/types';

// 한 조의 인원·책임자 수정(운영진). 근무표는 바꾸지 않는다. 체크리스트 카드와 스케줄 화면이 함께 쓴다.

export default function CrewEditor({
  store,
  date,
  shiftType,
  onSaved,
}: {
  store: StoreId;
  date: string;
  shiftType: ShiftType;
  onSaved?: () => void;
}) {
  const [plan, setPlan] = useState<CrewPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/garden-checklist/crew?store=${store}&date=${date}`, { cache: 'no-store' }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok || !j || j.error) return setError(j?.error ?? '불러오지 못했습니다.');
    setPlan(j);
  }, [store, date]);

  useEffect(() => {
    load();
  }, [load]);

  if (!plan) return error ? <p className="ta-error text-body">{error}</p> : <p className="text-body text-muted-foreground">불러오는 중</p>;

  const crew = plan.crews[shiftType];
  const nameOf = (id: number | null) => plan.people.find((p) => p.id === id)?.name ?? '';
  const locked = !plan.editable || crew.submitted;

  const save = async (members: number[], leadId: number | null) => {
    setSaving(true);
    setError(null);
    const r = await fetch('/api/garden-checklist/crew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', store, date, shiftType, members, leadId }),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setSaving(false);
    if (!r?.ok) setError(j?.error ?? '저장하지 못했습니다.');
    await load();
    if (r?.ok) onSaved?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-body">{SHIFT_LABEL[shiftType]}조</h3>
        <p className="text-caption text-muted-foreground">
          자동 제안: {crew.autoIds.map(nameOf).join(', ') || (plan.published ? '없음' : '스케줄 배포 전')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`${SHIFT_LABEL[shiftType]}조 인원`}>
        {plan.people.map((p) => {
          const on = crew.memberIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              disabled={locked || saving}
              className={on ? 'ta-btn-primary' : 'ta-btn'}
              onClick={() => save(on ? crew.memberIds.filter((id) => id !== p.id) : [...crew.memberIds, p.id], crew.pinnedLeadId)}
            >
              {p.name}
              {!p.linked && <span className="ml-1 text-caption opacity-70">계정 없음</span>}
            </button>
          );
        })}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-body">
        <span>책임자</span>
        <select
          className="ta-input w-[200px]"
          disabled={locked || saving || crew.memberIds.length === 0}
          value={crew.pinnedLeadId != null && crew.memberIds.includes(crew.pinnedLeadId) ? crew.pinnedLeadId : ''}
          onChange={(e) => save(crew.memberIds, e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">자동{crew.leadId != null && crew.pinnedLeadId == null ? ` (${nameOf(crew.leadId)})` : ''}</option>
          {crew.memberIds.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      </label>
      {crew.submitted && <p className="text-caption text-muted-foreground">제출된 체크리스트입니다. 다시 연 뒤에 바꿀 수 있습니다.</p>}
      {error && <p className="ta-error text-body">{error}</p>}
    </div>
  );
}
