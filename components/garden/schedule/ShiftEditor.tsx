'use client';

import { useState } from 'react';
import { fmtMd } from '@/lib/teaching/kst';
import { SHIFT_PRESETS, STEP_MIN, fmtMin, fmtSegment, segmentError } from '@/lib/schedule/time';
import type { Segment, ShiftKind } from '@/lib/schedule/types';

// 칸 편집 — 근무 버튼 또는 시간 직접 입력(30분 단위). 하루 여러 구간(분할근무) 가능.
const OPTIONS = Array.from({ length: (24 * 60 - 5 * 60) / STEP_MIN + 1 }, (_, i) => 5 * 60 + i * STEP_MIN);

export interface CellTarget {
  staffId: number;
  name: string;
  date: string;
  kind: ShiftKind;
  segments: Segment[];
  isOff: boolean;
  hasActualRow: boolean; // 실제 기록이 있는 칸 — '계획대로' 복귀를 보여준다
  planLabel: string;
}

export default function ShiftEditor({
  target,
  onSave,
  onClose,
}: {
  target: CellTarget;
  onSave: (segments: Segment[], off: boolean) => Promise<string | null>;
  onClose: () => void;
}) {
  const [segs, setSegs] = useState<Segment[]>(target.segments);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actual = target.kind === 'actual';

  const save = async (next: Segment[], off = false) => {
    const invalid = segmentError(next);
    if (invalid) return setError(invalid);
    setBusy(true);
    const err = await onSave(next, off);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  const setSeg = (i: number, patch: Partial<Segment>) => setSegs(segs.map((s, j) => (i === j ? { ...s, ...patch } : s)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="ta-card w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="m-0 text-title">{target.name}</h2>
        <p className="m-0 mt-1 text-body text-muted-foreground">
          {fmtMd(target.date)} · {actual ? '실제 근무' : '계획'}
          {actual && target.planLabel && ` · 계획 ${target.planLabel}`}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {SHIFT_PRESETS.map((p) => (
            <button key={p.label} type="button" disabled={busy} className="ta-btn justify-between" onClick={() => save([{ start: p.start, end: p.end }])}>
              <span>{p.label}</span>
              <span className="tabular text-muted-foreground">{fmtSegment(p)}</span>
            </button>
          ))}
        </div>

        <p className="ta-label mt-6">직접 입력</p>
        <div className="space-y-2">
          {segs.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <select aria-label="시작" className="ta-input flex-1" value={s.start} onChange={(e) => setSeg(i, { start: Number(e.target.value) })}>
                {OPTIONS.map((m) => <option key={m} value={m}>{fmtMin(m)}시</option>)}
              </select>
              <span className="text-muted-foreground">–</span>
              <select aria-label="종료" className="ta-input flex-1" value={s.end} onChange={(e) => setSeg(i, { end: Number(e.target.value) })}>
                {OPTIONS.map((m) => <option key={m} value={m}>{fmtMin(m)}시</option>)}
              </select>
              <button type="button" className="text-body text-muted-foreground" onClick={() => setSegs(segs.filter((_, j) => j !== i))}>삭제</button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 text-body text-muted-foreground"
          onClick={() => {
            const last = segs[segs.length - 1];
            setSegs([...segs, last ? { start: Math.min(last.end + 60, 23 * 60), end: Math.min(last.end + 120, 24 * 60) } : { start: 7 * 60, end: 16 * 60 }]);
          }}
        >
          + 구간 추가
        </button>

        {error && <p className="m-0 mt-3 text-body text-destructive">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4 text-body text-muted-foreground">
            {actual ? (
              <>
                <button type="button" disabled={busy} onClick={() => save([], true)}>쉬었음</button>
                {target.hasActualRow && <button type="button" disabled={busy} onClick={() => save([])}>{target.planLabel ? '계획대로' : '기록 삭제'}</button>}
              </>
            ) : (
              target.segments.length > 0 && <button type="button" disabled={busy} onClick={() => save([])}>근무 삭제</button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="ta-btn" onClick={onClose}>닫기</button>
            <button type="button" className="ta-btn-primary" disabled={busy || !segs.length} onClick={() => save(segs)}>저장</button>
          </div>
        </div>
      </div>
    </div>
  );
}
