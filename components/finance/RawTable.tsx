'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isNumericColumn,
  payloadCells,
  type RawQuery,
  type RawRowView,
  type RawSort,
} from '@/lib/finance/rawQuery';
import { rawQueryToParams } from '@/lib/finance/rawParams';

// 로우데이터 표 — 스프레드시트처럼 원본 컬럼 그대로, 원본 행번호와 함께.
// 정렬·필터·기간은 서버(finance.raw_rows_page)가 전 범위에 적용한 뒤 페이지로 내려준다.
// 클라이언트에서 걸렀다면 '불러온 200행' 안에서만 동작해 스크롤할수록 순서가 바뀌었을 것.

const PAGE = 200;

export default function RawTable({
  query: initialQuery,
  columns,
  initialRows,
  initialHasMore,
  categoryNames,
}: {
  query: RawQuery;
  columns: string[];
  initialRows: RawRowView[];
  initialHasMore: boolean;
  categoryNames: Record<number, string>;
}) {
  const [query, setQuery] = useState<RawQuery>(initialQuery);
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // 컬럼 필터 입력은 타이핑 중 매 글자마다 조회하지 않도록 따로 들고 있다가 디바운스로 반영
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>(initialQuery.filters ?? {});
  const [qDraft, setQDraft] = useState(initialQuery.q ?? '');

  // 서버가 새 조건으로 렌더하면(출처 탭·월 이동) 목록을 갈아끼운다
  useEffect(() => {
    setQuery(initialQuery);
    setRows(initialRows);
    setHasMore(initialHasMore);
    setFilterDraft(initialQuery.filters ?? {});
    setQDraft(initialQuery.q ?? '');
    setError(null);
  }, [initialQuery, initialRows, initialHasMore]);

  // 숫자 열 판별 — 정렬을 문자로 할지 숫자로 할지(금액을 문자로 정렬하면 '9'가 '10'보다 뒤로 간다)
  const numericCols = useMemo(() => columns.map((_, i) => isNumericColumn(rows, i)), [columns, rows]);

  /** 조건이 바뀌면 처음부터 다시 — 정렬·필터는 전 범위 대상이라 기존 목록을 이어 쓸 수 없다 */
  const reload = useCallback(async (next: RawQuery) => {
    setQuery(next);
    setLoading(true);
    setError(null);
    try {
      const params = rawQueryToParams(next, { offset: '0', limit: String(PAGE) });
      const res = await fetch(`/api/finance/raw/rows?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오지 못했어요.');
      setRows(json.rows as RawRowView[]);
      setHasMore(json.hasMore);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const params = rawQueryToParams(query, { offset: String(rows.length), limit: String(PAGE) });
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
  }, [loading, hasMore, rows.length, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  // 필터·검색어 디바운스 — 입력이 멎고 400ms 뒤에 한 번만 조회
  useEffect(() => {
    const same =
      JSON.stringify(filterDraft) === JSON.stringify(query.filters ?? {}) && qDraft === (query.q ?? '');
    if (same) return;
    const t = setTimeout(() => {
      reload({ ...query, filters: filterDraft, q: qDraft || null });
    }, 400);
    return () => clearTimeout(t);
  }, [filterDraft, qDraft, query, reload]);

  const toggleSort = (col: number) => {
    const s = query.sort ?? { by: 'row' as const };
    const active = s.by === 'col' && s.col === col;
    const next: RawSort = active
      ? s.desc
        ? { by: 'row' } // 오름 → 내림 → 원본 순으로 한 바퀴
        : { by: 'col', col, numeric: numericCols[col], desc: true }
      : { by: 'col', col, numeric: numericCols[col], desc: false };
    reload({ ...query, sort: next });
  };

  // 정렬 표시 — 활성 열은 방향 화살표, 나머지는 흐린 ⇅ 로 '클릭하면 정렬된다'는 단서를 준다
  // (제목이 평문으로 보여서 정렬 기능이 있는 줄 모르는 문제, 2026-08-20)
  const sortMark = (col: number) => {
    const s = query.sort;
    if (!s || s.by !== 'col' || s.col !== col)
      return <span className="ml-0.5 text-muted-foreground/40">⇅</span>;
    return <span className="ml-0.5 text-foreground">{s.desc ? '↓' : '↑'}</span>;
  };

  const setRange = (from: string | null, to: string | null) => reload({ ...query, from, to });

  return (
    <div className="flex flex-col gap-3">
      {/* 기간 선택 — 월 단축은 페이지(서버)가 링크로, 임의 기간은 여기서 */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">기간</span>
        <input
          type="date"
          value={query.from ?? ''}
          onChange={(e) => setRange(e.target.value || null, query.to ?? null)}
          className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:border-foreground/40"
        />
        <span className="text-muted-foreground">~</span>
        <input
          type="date"
          value={query.to ?? ''}
          onChange={(e) => setRange(query.from ?? null, e.target.value || null)}
          className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:border-foreground/40"
        />
        {(query.from || query.to) && (
          <button
            onClick={() => setRange(null, null)}
            className="text-muted-foreground underline transition-colors hover:text-foreground"
          >
            기간 해제
          </button>
        )}
        <input
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          placeholder="전체 검색"
          className="ml-2 h-8 w-48 rounded-md border border-border bg-background px-2.5 text-[13px] outline-none focus:border-foreground/40"
        />
        <span className="text-muted-foreground">
          {loading ? '정렬·필터 적용 중…' : `${rows.length.toLocaleString()}행${hasMore ? '+' : ''}`}
        </span>
        <a
          href={`/api/finance/raw/export?${rawQueryToParams(query)}`}
          className="ml-auto text-[13px] text-muted-foreground underline transition-colors hover:text-foreground"
        >
          CSV 내려받기 →
        </a>
      </div>

      {rows.length === 0 && !loading ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">
          {error ?? '이 조건에 해당하는 원본 행이 없어요.'}
        </p>
      ) : (
        {/* 재조회 중엔 표를 흐리게 — 정렬·필터 응답이 몇 초 걸릴 때 '클릭이 안 먹었다'는 오해를 막는다 */}
        <div
          className={`max-h-[70vh] overflow-auto rounded-md border border-border transition-opacity ${
            loading ? 'pointer-events-none opacity-40' : ''
          }`}
          aria-busy={loading}
        >
          <table className="w-max min-w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="whitespace-nowrap px-2 py-1.5 font-normal">행</th>
                <th className="whitespace-nowrap px-2 py-1.5 font-normal">
                  <button
                    onClick={() => {
                      const s = query.sort;
                      const active = s?.by === 'date';
                      reload({
                        ...query,
                        sort: active ? (s.desc ? { by: 'row' } : { by: 'date', desc: true }) : { by: 'date' },
                      });
                    }}
                    className="transition-colors hover:text-foreground"
                  >
                    날짜
                    {query.sort?.by === 'date' ? (
                      <span className="ml-0.5 text-foreground">{query.sort.desc ? '↓' : '↑'}</span>
                    ) : (
                      <span className="ml-0.5 text-muted-foreground/40">⇅</span>
                    )}
                  </button>
                </th>
                {columns.map((c, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1.5 font-normal">
                    <button onClick={() => toggleSort(i)} className="transition-colors hover:text-foreground">
                      {c}
                      {sortMark(i)}
                    </button>
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-1.5 font-normal">가공 결과</th>
              </tr>
              {/* 컬럼별 필터 — 각 열에 포함된 문자로 거른다 */}
              <tr className="border-b border-border bg-card">
                <th />
                <th />
                {columns.map((_, i) => (
                  <th key={i} className="px-1 py-1">
                    <input
                      value={filterDraft[String(i)] ?? ''}
                      onChange={(e) =>
                        setFilterDraft((prev) => {
                          const next = { ...prev };
                          if (e.target.value) next[String(i)] = e.target.value;
                          else delete next[String(i)];
                          return next;
                        })
                      }
                      placeholder="필터"
                      className="h-6 w-full min-w-[70px] rounded border border-border bg-background px-1.5 text-[11px] font-normal outline-none focus:border-foreground/40"
                    />
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cells = payloadCells(r.payload, columns);
                return (
                  <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">{r.row_index}</td>
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
                      {r.row_date ?? ''}
                    </td>
                    {columns.map((_, i) => (
                      <td key={i} className="max-w-[280px] truncate px-2 py-1" title={cells[i]}>
                        {cells[i]}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-1">
                      {r.tx ? (
                        <span className="text-muted-foreground">
                          {r.tx.category_id != null
                            ? (categoryNames[r.tx.category_id] ?? `#${r.tx.category_id}`)
                            : '미분류'}
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
