'use client';

import { useCallback, useEffect, useState } from 'react';
import SegmentControl from '@/components/nav/SegmentControl';
import { groupBySection } from '@/lib/checklist/logic';
import { SHIFT_LABEL, type ChecklistItem, type Frequency, type ShiftType } from '@/lib/checklist/types';
import { STORES, type StoreId } from '@/lib/types';

// 항목 관리(운영진) — 사진 필수 지정·켜고 끄기·문구·주기·순서. 저장은 바꿀 때마다 바로.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const freqText = (i: ChecklistItem) =>
  i.frequency === 'daily' ? '매일' : i.frequency === 'weekly' ? `매주 ${WEEKDAYS[i.weekday ?? 0]}` : `매월 첫 ${WEEKDAYS[i.weekday ?? 0]}`;

export default function ChecklistItemManager({ store, onStore }: { store: StoreId; onStore: (s: StoreId) => void }) {
  const [shiftType, setShiftType] = useState<ShiftType>('open');
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/garden-checklist/items?store=${store}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({ error: '불러오지 못했습니다.' }));
    if (!r.ok || j.error) return setError(j.error ?? '불러오지 못했습니다.');
    setError(null);
    setItems(j.items);
  }, [store]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const patch = async (id: number, body: Record<string, unknown>) => {
    const r = await fetch('/api/garden-checklist/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) {
      setError(j?.error ?? '저장하지 못했습니다.');
      return false;
    }
    setError(null);
    setItems((cur) => (cur ?? []).map((i) => (i.id === id ? j.item : i)));
    return true;
  };

  const add = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/garden-checklist/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store, shiftType, ...body }),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) {
      setError(j?.error ?? '추가하지 못했습니다.');
      return false;
    }
    setError(null);
    setItems((cur) => [...(cur ?? []), j.item]);
    setAdding(false);
    return true;
  };

  // 바로 위·아래 항목과 순서값을 맞바꾼다. 값이 같으면(새 항목 등) 한 칸 벌린다.
  const move = async (list: ChecklistItem[], index: number, delta: -1 | 1) => {
    const a = list[index];
    const b = list[index + delta];
    if (!b) return;
    const aOrder = a.sortOrder === b.sortOrder ? b.sortOrder + delta : b.sortOrder;
    await Promise.all([patch(a.id, { sortOrder: aOrder }), patch(b.id, { sortOrder: a.sortOrder })]);
  };

  const shown = (items ?? []).filter((i) => i.shiftType === shiftType).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <SegmentControl ariaLabel="지점" items={STORES.map((s) => ({ id: s.id, label: s.short }))} value={store} onSelect={(id) => onStore(id as StoreId)} />
        <SegmentControl
          ariaLabel="조"
          items={(['open', 'close'] as const).map((id) => ({ id, label: SHIFT_LABEL[id] }))}
          value={shiftType}
          onSelect={(id) => {
            setShiftType(id as ShiftType);
            setEditing(null);
            setAdding(false);
          }}
        />
        <button type="button" className="ta-btn" onClick={() => setAdding((v) => !v)}>
          + 항목
        </button>
      </div>
      {error && <p className="ta-error text-body">{error}</p>}
      {adding && (
        <section className="ta-panel">
          <ItemForm onCancel={() => setAdding(false)} onSave={add} />
        </section>
      )}
      {items === null && !error && <p className="text-body text-muted-foreground">불러오는 중</p>}
      {groupBySection(shown).map((g) => (
        <section key={g.section} className="ta-panel">
          <h3 className="text-body font-medium">{g.section}</h3>
          <ul className="mt-2 divide-y divide-border">
            {g.items.map((item) => {
              const index = shown.findIndex((i) => i.id === item.id);
              return (
                <li key={item.id} className="py-2">
                  {editing === item.id ? (
                    <ItemForm
                      item={item}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => {
                        const ok = await patch(item.id, body);
                        if (ok) setEditing(null);
                        return ok;
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className={`min-w-[12rem] flex-1 ${item.active ? '' : 'text-muted-foreground'}`}>
                        <p className="text-body">
                          {item.label}
                          {item.origin === 'proposal' && <span className="ml-2 text-caption text-amber-600">제안</span>}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {freqText(item)}
                          {item.detail && ` · ${item.detail}`}
                        </p>
                      </div>
                      <label className="flex min-h-9 items-center gap-2 text-body">
                        <input type="checkbox" checked={item.photoRequired} onChange={(e) => patch(item.id, { photoRequired: e.target.checked })} />
                        사진 필수
                      </label>
                      <label className="flex min-h-9 items-center gap-2 text-body">
                        <input type="checkbox" checked={item.active} onChange={(e) => patch(item.id, { active: e.target.checked })} />
                        사용
                      </label>
                      <div className="flex gap-1">
                        <button type="button" className="ta-btn px-3" aria-label="위로" disabled={index === 0} onClick={() => move(shown, index, -1)}>
                          ↑
                        </button>
                        <button type="button" className="ta-btn px-3" aria-label="아래로" disabled={index === shown.length - 1} onClick={() => move(shown, index, 1)}>
                          ↓
                        </button>
                        <button type="button" className="ta-btn" onClick={() => setEditing(item.id)}>
                          수정
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ItemForm({
  item,
  onSave,
  onCancel,
}: {
  item?: ChecklistItem;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [section, setSection] = useState(item?.section ?? '');
  const [label, setLabel] = useState(item?.label ?? '');
  const [detail, setDetail] = useState(item?.detail ?? '');
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? 'daily');
  const [weekday, setWeekday] = useState(item?.weekday ?? 2);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave({ section, label, detail, frequency, weekday: frequency === 'daily' ? null : weekday, ...(item ? {} : { sortOrder: 100000 }) });
    setSaving(false);
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input className="ta-input" value={section} onChange={(e) => setSection(e.target.value)} placeholder="구역" maxLength={120} />
      <input className="ta-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="항목 이름" maxLength={120} />
      <input className="ta-input sm:col-span-2" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="세부 설명(선택)" maxLength={200} />
      <select className="ta-input" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} aria-label="주기">
        <option value="daily">매일</option>
        <option value="weekly">매주</option>
        <option value="monthly">매월 첫 요일</option>
      </select>
      {frequency !== 'daily' ? (
        <select className="ta-input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label="요일">
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}요일
            </option>
          ))}
        </select>
      ) : (
        <span />
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="button" className="ta-btn-primary" onClick={save} disabled={saving}>
          저장
        </button>
        <button type="button" className="ta-btn" onClick={onCancel} disabled={saving}>
          취소
        </button>
      </div>
    </div>
  );
}
