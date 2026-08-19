'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { payloadCells, type RawRowView } from '@/lib/finance/rawQuery';

// 로우데이터 표 — 스프레드시트처럼 원본 컬럼을 그대로, 원본 행번호와 함께 보여준다.
// 가공(transactions)으로 이어진 행은 우측에 거래 배지가 붙어 "이 줄이 어떻게 처리됐나"를 바로 안다.

const PAGE = 200;

export default function RawTable({
  source,
  brand,
  ym,
  columns,
  initialRows,
  initialHasMore,
  categoryNames,
}: {
  source: string;
  brand: string | null;
  ym: string | null;
  columns: string[];
  initialRows: RawRowView[];
  initialHasMore: boolean;
  categoryNames: Record<number, string>;
}) {
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const sentinel = useRef<HTMLDivElement>(null);

  // 필터·월이 바뀌면 서버가 새 initialRows 를 내려준다 — 그때 목록을 갈아끼운다
  useEffect(() => {
    setRows(initialRows);
    setHasMore(initialHasMore);
    setError(null);
  }, [initialRows, initialHasMore]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ source, offset: String(rows.length), limit: String(PAGE) });
      if (brand) params.set('brand', brand);
      if (ym) params.set('ym', ym);
      const res = await fetch(`/api/finance/raw/rows?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오지 못했어요.');
      setRows((prev) => [...prev, ...(json.rows as RawRowView[])]);
      setHasMore(json.hasMore);
    } catch (e) {
      setError((e as Error).message);
      setHasMore(false); // 무한 재시도로 서버를 두드리지 않게
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, rows.length, source, brand, ym]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  const needle = q.trim().toLowerCase();
  const view = needle
    ? rows.filter((r) => payloadCells(r.payload, columns).some((c) => c.toLowerCase().includes(needle)))
    : rows;

  const exportParams = new URLSearchParams({ source });
  if (brand) exportParams.set('brand', brand);
  if (ym) exportParams.set('ym', ym);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="불러온 행에서 찾기"
          className="h-8 w-56 rounded-md border border-border bg-background px-2.5 text-[13px] outline-none focus:border-foreground/40"
        />
        <span className="text-[12px] text-muted-foreground">
          {needle ? `${view.length.toLocaleString()} / ` : ''}
          {rows.length.toLocaleString()}행 불러옴{hasMore ? ' (더 있어요)' : ''}
        </span>
        <a
          href={`/api/finance/raw/export?${exportParams}`}
          className="ml-auto text-[13px] text-muted-foreground underline transition-colors hover:text-foreground"
        >
          CSV 내려받기 →
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">
          이 조건에 해당하는 원본 행이 없어요. 자료를 올리면 여기에 원본 그대로 쌓여요.
        </p>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
          <table className="w-max min-w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="whitespace-nowrap px-2 py-1.5 font-normal">행</th>
                {columns.map((c, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1.5 font-normal">
                    {c}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-1.5 font-normal">가공 결과</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => {
                const cells = payloadCells(r.payload, columns);
                return (
                  <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">{r.row_index}</td>
                    {columns.map((_, i) => (
                      <td key={i} className="max-w-[280px] truncate px-2 py-1" title={cells[i]}>
                        {cells[i]}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-1">
                      {r.tx ? (
                        <span className="text-muted-foreground">
                          {r.tx.category_id != null ? (categoryNames[r.tx.category_id] ?? `#${r.tx.category_id}`) : '미분류'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div ref={sentinel} />
          {loading && <p className="py-3 text-center text-[12px] text-muted-foreground">불러오는 중…</p>}
          {error && <p className="py-3 text-center text-[12px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
