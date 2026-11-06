'use client';

import { useState } from 'react';
import { TAG_LABEL_MAX, TAG_MAX, type TagDef, type TagKind } from '@/lib/schedule/types';

// 역할·책임 태그 목록 편집 창 — 이름·색(역할만)·순서·추가·삭제. 저장해야 반영. 삭제하면 직원에게서도 빠진다.
const TITLE: Record<TagKind, string> = { role: '역할 목록 편집', duty: '책임 태그 편집' };
const HINT: Record<TagKind, string> = {
  role: '시간대별 인원의 색 점과 직원별 역할 버튼이 됩니다. 삭제하면 그 역할을 가진 직원에게서도 빠집니다.',
  duty: '위에 있을수록 체크리스트 책임자로 먼저 뽑힙니다. 삭제하면 그 태그를 가진 직원은 "없음"이 됩니다.',
};

export default function TagListEditor({ kind, items, onSaved, onClose }: { kind: TagKind; items: TagDef[]; onSaved: () => Promise<void> | void; onClose: () => void }) {
  const [list, setList] = useState<TagDef[]>(items.map((t) => ({ ...t })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const removedCount = items.filter((t) => !list.some((x) => x.key === t.key)).length;

  const set = (i: number, patch: Partial<TagDef>) => setList(list.map((t, j) => (i === j ? { ...t, ...patch } : t)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const save = async () => {
    if (removedCount && !window.confirm(`${removedCount}개를 삭제합니다. 그 태그를 가진 직원에게서도 빠집니다. 계속할까요?`)) return;
    setBusy(true);
    setError(null);
    const r = await fetch('/api/garden-schedule/tags', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, items: list.map((t) => (t.key.startsWith('new_') ? { ...t, key: undefined } : t)) }) }); // 새 항목 키는 서버가 만든다
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? '저장하지 못했습니다.');
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="ta-card flex max-h-[85vh] w-full max-w-[440px] flex-col" onClick={(e) => e.stopPropagation()}>
        <h2 className="m-0 text-title">{TITLE[kind]}</h2>
        <p className="m-0 mt-1 text-caption text-muted-foreground">{HINT[kind]}</p>
        <div className="mt-4 min-h-0 space-y-2 overflow-y-auto">
          {list.map((t, i) => (
            <div key={t.key} className="flex items-center gap-2">
              {kind === 'role' && (
                <input aria-label={`${t.label || '역할'} 색`} type="color" className="h-9 w-9 cursor-pointer rounded-md border-0 bg-transparent p-0" value={t.color ?? '#999999'} onChange={(e) => set(i, { color: e.target.value })} />
              )}
              <input aria-label="이름" className="ta-input w-[150px]" value={t.label} maxLength={TAG_LABEL_MAX} placeholder="이름" onChange={(e) => set(i, { label: e.target.value })} />
              <span className="ml-auto flex gap-2 text-caption text-muted-foreground">
                <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label="아래로" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" onClick={() => setList(list.filter((_, j) => j !== i))}>삭제</button>
              </span>
            </div>
          ))}
          {list.length === 0 && <p className="m-0 text-body text-muted-foreground">항목이 없습니다.</p>}
        </div>
        {list.length < TAG_MAX && (
          <button type="button" className="mt-2 self-start text-body text-muted-foreground" onClick={() => setList([...list, { key: `new_${Date.now()}`, label: '', ...(kind === 'role' ? { color: '#9CA3AF' } : {}) }])}>
            + 추가
          </button>
        )}
        {error && <p className="m-0 mt-3 text-body text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="ta-btn" onClick={onClose}>닫기</button>
          <button type="button" className="ta-btn-primary" disabled={busy} onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}
