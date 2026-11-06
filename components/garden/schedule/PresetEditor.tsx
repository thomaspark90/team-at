'use client';

import { useState } from 'react';
import { STEP_MIN, fmtMin, segmentError } from '@/lib/schedule/time';
import { PRESET_LABEL_MAX, PRESET_MAX, type ShiftPreset } from '@/lib/schedule/types';

// 근무 파트 편집 — 칸 편집기의 '파트 수정'이 연다. 이름·시작·종료를 고치고 추가·삭제·순서 이동. 저장해야 반영된다.
const OPTIONS = Array.from({ length: (24 * 60 - 5 * 60) / STEP_MIN + 1 }, (_, i) => 5 * 60 + i * STEP_MIN);

export default function PresetEditor({
  presets,
  storeLabel,
  onSave,
  onClose,
}: {
  presets: ShiftPreset[];
  storeLabel: string;
  onSave: (presets: ShiftPreset[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const [list, setList] = useState<ShiftPreset[]>(presets.map((p) => ({ ...p })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (i: number, patch: Partial<ShiftPreset>) => setList(list.map((p, j) => (i === j ? { ...p, ...patch } : p)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const save = async () => {
    for (const p of list) {
      if (!p.label.trim()) return setError('파트 이름을 적어주세요.');
      const invalid = segmentError([p]);
      if (invalid) return setError(`${p.label}: ${invalid}`);
    }
    setBusy(true);
    const err = await onSave(list.map((p) => ({ ...p, label: p.label.trim() })));
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="ta-card flex max-h-[85vh] w-full max-w-[520px] flex-col" onClick={(e) => e.stopPropagation()}>
        <h2 className="m-0 text-title">근무 파트 수정 · {storeLabel}</h2>
        <p className="m-0 mt-1 text-caption text-muted-foreground">칸 편집기의 버튼이 됩니다. 지점마다 따로 저장되고, 이미 넣은 근무는 바뀌지 않습니다.</p>

        <div className="mt-4 min-h-0 space-y-2 overflow-y-auto">
          {list.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label="파트 이름"
                className="ta-input w-[130px]"
                value={p.label}
                maxLength={PRESET_LABEL_MAX}
                placeholder="파트 이름"
                onChange={(e) => set(i, { label: e.target.value })}
              />
              <select aria-label="시작" className="ta-input w-[92px]" value={p.start} onChange={(e) => set(i, { start: Number(e.target.value) })}>
                {OPTIONS.map((m) => <option key={m} value={m}>{fmtMin(m)}시</option>)}
              </select>
              <span className="text-muted-foreground">–</span>
              <select aria-label="종료" className="ta-input w-[92px]" value={p.end} onChange={(e) => set(i, { end: Number(e.target.value) })}>
                {OPTIONS.map((m) => <option key={m} value={m}>{fmtMin(m)}시</option>)}
              </select>
              <span className="ml-auto flex gap-2 text-caption text-muted-foreground">
                <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label="아래로" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" onClick={() => setList(list.filter((_, j) => j !== i))}>삭제</button>
              </span>
            </div>
          ))}
          {list.length === 0 && <p className="m-0 text-body text-muted-foreground">파트가 없습니다. 직접 입력만 쓰게 됩니다.</p>}
        </div>
        {list.length < PRESET_MAX && (
          <button type="button" className="mt-2 self-start text-body text-muted-foreground" onClick={() => setList([...list, { label: '', start: 7 * 60, end: 16 * 60 }])}>
            + 파트 추가
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
