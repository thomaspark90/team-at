import type { StoreId } from '@/lib/types';

export interface LinkViewSummary {
  views: number;
  /** 서로 다른 기기 수. 기기 값을 못 받은 열람은 한 대로 묶인다. */
  visitors: number;
  lastAt: string;
}

/** 직원 링크 열람 줄 → 지점별 요약. 순수 함수. */
export function summarizeViews(rows: { store: string; visitor: string; viewed_at: string }[]): Partial<Record<StoreId, LinkViewSummary>> {
  const out: Partial<Record<StoreId, LinkViewSummary>> = {};
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const store = r.store as StoreId;
    const cur = out[store] ?? { views: 0, visitors: 0, lastAt: r.viewed_at };
    cur.views += 1;
    if (r.viewed_at > cur.lastAt) cur.lastAt = r.viewed_at;
    const set = seen.get(store) ?? new Set<string>();
    set.add(r.visitor);
    seen.set(store, set);
    cur.visitors = set.size;
    out[store] = cur;
  }
  return out;
}
