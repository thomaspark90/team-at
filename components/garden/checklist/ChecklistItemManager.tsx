'use client';

import { useCallback, useEffect, useState } from 'react';
import SegmentControl from '@/components/nav/SegmentControl';
import { groupBySection } from '@/lib/checklist/logic';
import { insertAtSectionEnd, moveItem, moveSection, renameSection, renumber, type DropTarget } from '@/lib/checklist/ordering';
import { SHIFT_LABEL, type ChecklistItem, type ShiftType } from '@/lib/checklist/types';
import { STORES, type StoreId } from '@/lib/types';
import ItemForm, { WEEKDAYS } from './ItemForm';
import { useRowDrag } from './useRowDrag';

// 항목 관리 — 추가·삭제·끌어서 순서 바꾸기·구역 이동·사진 필수·켜고 끄기. 저장은 바꿀 때마다 바로.

const freqText = (i: ChecklistItem) =>
  i.frequency === 'daily' ? '매일' : i.frequency === 'weekly' ? `매주 ${WEEKDAYS[i.weekday ?? 0]}` : `매월 첫 ${WEEKDAYS[i.weekday ?? 0]}`;

const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const API = '/api/garden-checklist/items';

export default function ChecklistItemManager() {
  const [store, setStore] = useState<StoreId>('pangyo');
  const [shiftType, setShiftType] = useState<ShiftType>('open');
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState<{ section: string } | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [deleted, setDeleted] = useState<ChecklistItem | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`${API}?store=${store}`, { cache: 'no-store' }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok || !j || j.error) return setError(j?.error ?? '불러오지 못했습니다.');
    setError(null);
    setItems(j.items);
  }, [store]);

  useEffect(() => {
    setItems(null);
    setDeleted(null);
    load();
  }, [load]);

  const others = (items ?? []).filter((i) => i.shiftType !== shiftType);
  const shown = (items ?? []).filter((i) => i.shiftType === shiftType).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const groups = groupBySection(shown);

  const patch = async (id: number, body: Record<string, unknown>) => {
    const r = await fetch(API, json('PATCH', { id, ...body })).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) {
      setError(j?.error ?? '저장하지 못했습니다. 연결을 확인해 주세요.');
      return false;
    }
    setError(null);
    setItems((cur) => {
      const list = cur ?? [];
      return list.some((i) => i.id === id) ? list.map((i) => (i.id === id ? j.item : i)) : [...list, j.item];
    });
    return true;
  };

  /** 순서 저장 — 화면을 먼저 바꾸고, 실패하면 서버 값으로 되돌린다. */
  const saveOrder = async (next: ChecklistItem[]) => {
    setItems([...others, ...renumber(next)]);
    const r = await fetch(`${API}/reorder`, json('POST', { store, shiftType, order: next.map((i) => ({ id: i.id, section: i.section })) })).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) {
      setError(j?.error ?? '순서를 저장하지 못했습니다. 연결을 확인해 주세요.');
      await load();
      return false;
    }
    setError(null);
    setItems(j.items);
    return true;
  };

  const add = async (body: Record<string, unknown>) => {
    const r = await fetch(API, json('POST', { store, shiftType, ...body })).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) {
      setError(j?.error ?? '추가하지 못했습니다.');
      return false;
    }
    setAdding(null);
    return saveOrder(insertAtSectionEnd(shown, j.item as ChecklistItem));
  };

  const remove = async (item: ChecklistItem) => {
    const r = await fetch(API, json('DELETE', { id: item.id })).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) return setError(j?.error ?? '삭제하지 못했습니다.');
    setError(null);
    setItems((cur) => (cur ?? []).filter((i) => i.id !== item.id));
    setDeleted(item);
  };

  const undoDelete = async () => {
    if (deleted && (await patch(deleted.id, { deleted: false }))) setDeleted(null);
  };

  const { dragId, over, handleProps } = useRowDrag((id: number, drop: DropTarget) => void saveOrder(moveItem(shown, id, drop)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <SegmentControl ariaLabel="지점" items={STORES.map((s) => ({ id: s.id, label: s.short }))} value={store} onSelect={(id) => setStore(id as StoreId)} />
        <SegmentControl
          ariaLabel="조"
          items={(['open', 'close'] as const).map((id) => ({ id, label: SHIFT_LABEL[id] }))}
          value={shiftType}
          onSelect={(id) => {
            setShiftType(id as ShiftType);
            setEditing(null);
            setAdding(null);
            setRenaming(null);
          }}
        />
        <button type="button" className="ta-btn" onClick={() => setAdding({ section: '' })}>
          + 새 구역
        </button>
      </div>
      {error && <p className="ta-error text-body">{error}</p>}
      {deleted && (
        <p className="text-body text-muted-foreground">
          &apos;{deleted.label}&apos; 항목을 삭제했습니다. 지난 기록은 남습니다.{' '}
          <button type="button" className="min-h-9 text-foreground underline" onClick={undoDelete}>
            되돌리기
          </button>
        </p>
      )}
      {adding?.section === '' && (
        <section className="ta-panel">
          <ItemForm sections={groups.map((g) => g.section)} onCancel={() => setAdding(null)} onSave={add} />
        </section>
      )}
      {items === null && !error && <p className="text-body text-muted-foreground">불러오는 중</p>}
      {groups.map((g, groupIndex) => (
        <section key={`${groupIndex}-${g.section}`} className="ta-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {renaming === groupIndex ? (
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
                  if (!name) return setError('구역 이름을 적어주세요.');
                  if (name === g.section || (await saveOrder(renameSection(shown, groupIndex, name)))) setRenaming(null);
                }}
              >
                <input name="name" aria-label="구역 이름" className="ta-input min-w-0 flex-1" defaultValue={g.section} maxLength={120} autoFocus />
                <button type="submit" className="ta-btn">저장</button>
                <button type="button" className="ta-btn" onClick={() => setRenaming(null)}>취소</button>
              </form>
            ) : (
              <>
                <h3 className="text-body font-medium">{g.section}</h3>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="ta-btn px-3" aria-label={`${g.section} 구역 위로`} disabled={groupIndex === 0} onClick={() => saveOrder(moveSection(shown, groupIndex, -1))}>↑</button>
                  <button type="button" className="ta-btn px-3" aria-label={`${g.section} 구역 아래로`} disabled={groupIndex === groups.length - 1} onClick={() => saveOrder(moveSection(shown, groupIndex, 1))}>↓</button>
                  <button type="button" className="ta-btn" onClick={() => setRenaming(groupIndex)}>이름</button>
                  <button type="button" className="ta-btn" onClick={() => setAdding({ section: g.section })}>+ 항목</button>
                </div>
              </>
            )}
          </div>
          <ul className="mt-2 divide-y divide-border">
            {g.items.map((item) => {
              const index = shown.findIndex((i) => i.id === item.id);
              const marker = over?.targetId === item.id && dragId !== item.id ? over.place : null;
              return (
                <li key={item.id} data-row-id={item.id} className={`relative py-2 ${dragId === item.id ? 'opacity-40' : ''}`}>
                  {marker && <span aria-hidden className={`absolute inset-x-0 h-0.5 bg-foreground ${marker === 'before' ? 'top-0' : 'bottom-0'}`} />}
                  {editing === item.id ? (
                    <ItemForm
                      item={item}
                      sections={groups.map((x) => x.section)}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => {
                        const ok = await patch(item.id, body);
                        if (ok) setEditing(null);
                        return ok;
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <button
                        type="button"
                        aria-label={`${item.label} 끌어서 옮기기`}
                        title="끌어서 옮기기"
                        className="flex h-10 w-8 shrink-0 cursor-grab touch-none select-none items-center justify-center text-title text-muted-foreground active:cursor-grabbing"
                        {...handleProps(item.id)}
                      >
                        ≡
                      </button>
                      <div className={`min-w-[10rem] flex-1 ${item.active ? '' : 'text-muted-foreground'}`}>
                        <p className="text-body">
                          {item.label}
                          {item.origin === 'proposal' && <span className="ml-2 text-caption text-amber-600">제안</span>}
                          {!item.active && <span className="ml-2 text-caption">꺼짐</span>}
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
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className="ta-btn px-3" aria-label={`${item.label} 위로`} disabled={index === 0} onClick={() => saveOrder(moveItem(shown, item.id, { targetId: shown[index - 1].id, place: 'before' }))}>
                          ↑
                        </button>
                        <button type="button" className="ta-btn px-3" aria-label={`${item.label} 아래로`} disabled={index === shown.length - 1} onClick={() => saveOrder(moveItem(shown, item.id, { targetId: shown[index + 1].id, place: 'after' }))}>
                          ↓
                        </button>
                        <button type="button" className="ta-btn" onClick={() => setEditing(item.id)}>
                          수정
                        </button>
                        <button type="button" className="ta-btn" onClick={() => remove(item)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {adding?.section === g.section && adding.section !== '' && (
            <div className="mt-3">
              <ItemForm defaultSection={g.section} sections={groups.map((x) => x.section)} onCancel={() => setAdding(null)} onSave={add} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
