'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Candidate, ReorderItem } from '@/lib/reorder/types';
import type { StoreId } from '@/lib/types';
import CandidateList from './CandidateList';
import ItemRow from './ItemRow';
import { jsonInit } from './format';

// 발주 품목표(1단계) — 결제 기록에서 뽑은 후보를 품목으로 올리고, 규격·판매처를 다듬는다.
// 1차는 양재천만(2026-11-26 대표 결정). 가격 조회·발주 버튼은 다음 단계.

const STORE: StoreId = 'yangjae';
const API = '/api/garden-reorder';

export default function ReorderManager() {
  const [items, setItems] = useState<ReorderItem[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ text: string; run: () => Promise<boolean> } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`${API}?store=${STORE}`, { cache: 'no-store' }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok || !j || j.error) return setError(j?.error ?? '불러오지 못했습니다.');
    setError(null);
    setItems(j.items);
    setCandidates(j.candidates);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** 저장하고 다시 불러온다 — 지난 구매가·판매처가 서버 계산이라 통째로 받는다. */
  const send = async (path: string, method: string, body: Record<string, unknown>) => {
    setBusy(true);
    const r = await fetch(`${API}${path}`, jsonInit(method, body)).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setError(j?.error ?? '저장하지 못했습니다. 연결을 확인해 주세요.');
      return false;
    }
    await load();
    return true;
  };

  const ignore = async (c: Candidate) => {
    if (await send('/ignored', 'POST', { store: STORE, name: c.name }))
      setUndo({ text: `'${c.name}' 후보를 버렸습니다.`, run: () => send('/ignored', 'DELETE', { store: STORE, name: c.name }) });
  };

  const patchItem = async (item: ReorderItem, body: Record<string, unknown>) => {
    const ok = await send('/items', 'PATCH', { id: item.id, ...body });
    if (ok && body.deleted === true) {
      setOpenId(null);
      setEditingId(null);
      setUndo({ text: `'${item.name}' 품목을 삭제했습니다.`, run: () => send('/items', 'PATCH', { id: item.id, deleted: false }) });
    }
    return ok;
  };

  return (
    <div className="space-y-5">
      {error && <p className="ta-error text-body">{error}</p>}
      {undo && (
        <p className="text-body text-muted-foreground">
          {undo.text}{' '}
          <button
            type="button"
            className="min-h-9 text-foreground underline"
            onClick={async () => {
              if (await undo.run()) setUndo(null);
            }}
          >
            되돌리기
          </button>
        </p>
      )}
      {items === null && !error && <p className="text-body text-muted-foreground">불러오는 중</p>}
      {items !== null && (
        <>
          <section className="ta-panel">
            <h3 className="text-body font-medium">품목 {items.length}</h3>
            {items.length === 0 ? (
              <p className="mt-2 text-body text-muted-foreground">아직 품목이 없습니다. 아래 후보에서 올려 주세요.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    open={openId === item.id}
                    editing={editingId === item.id}
                    onToggle={() => {
                      setOpenId(openId === item.id ? null : item.id);
                      setEditingId(null);
                    }}
                    onEdit={(on) => setEditingId(on ? item.id : null)}
                    onPatch={(body) => patchItem(item, body)}
                    onSeller={(seller, body) => send('/sellers', 'PATCH', { itemId: item.id, seller, ...body })}
                  />
                ))}
              </ul>
            )}
          </section>
          <section className="ta-panel">
            <h3 className="text-body font-medium">후보 {candidates.length}</h3>
            <p className="mt-1 text-caption text-muted-foreground">최근 6개월 동안 양재천으로 3회 이상 받은 네이버페이·쿠팡 결제입니다.</p>
            <div className="mt-2">
              <CandidateList
                candidates={candidates}
                items={items}
                busy={busy}
                onCreate={(c) => send('/items', 'POST', { store: STORE, matchNames: [c.name] })}
                onMerge={(c, itemId) => send('/items', 'PATCH', { id: itemId, addMatchName: c.name })}
                onIgnore={ignore}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
