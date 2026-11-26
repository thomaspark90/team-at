'use client';

import type { Candidate, ReorderItem } from '@/lib/reorder/types';
import { shortDate, won } from './format';

// 품목 후보 — 결제 기록에서 반복해 산 상품명. 새 품목으로 올리거나, 기존 품목에 합치거나, 버린다.

export default function CandidateList({
  candidates,
  items,
  busy,
  onCreate,
  onMerge,
  onIgnore,
}: {
  candidates: Candidate[];
  items: ReorderItem[];
  busy: boolean;
  onCreate: (c: Candidate) => void;
  onMerge: (c: Candidate, itemId: number) => void;
  onIgnore: (c: Candidate) => void;
}) {
  if (!candidates.length) return <p className="text-body text-muted-foreground">새 후보가 없습니다.</p>;
  return (
    <ul className="divide-y divide-border">
      {candidates.map((c) => (
        <li key={c.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <div className="min-w-[14rem] flex-1">
            <p className="text-body">{c.name}</p>
            <p className="text-caption text-muted-foreground">
              {c.count}회 · 합계 {won(c.sum)} · 최근 {shortDate(c.lastDate)} {won(c.lastAmount)} · {c.sellers.join(', ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className="ta-btn" disabled={busy} onClick={() => onCreate(c)}>
              품목으로
            </button>
            {items.length > 0 && (
              <select
                className="ta-input w-auto"
                aria-label={`${c.name} 기존 품목에 합치기`}
                value=""
                disabled={busy}
                onChange={(e) => e.target.value && onMerge(c, Number(e.target.value))}
              >
                <option value="">합치기</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="ta-btn" disabled={busy} onClick={() => onIgnore(c)}>
              버리기
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
