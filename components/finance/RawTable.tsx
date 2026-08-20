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

// 금액 구간 입력 보조 — 콤마 없는 숫자만 보관, 표시할 때 콤마
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '');
const fmtDigits = (v: string) => (v ? Number(v).toLocaleString('ko-KR') : '');
function normalizeRanges(
  ranges?: Record<string, { min?: string | null; max?: string | null }> | null
): Record<string, { min: string; max: string }> {
  const out: Record<string, { min: string; max: string }> = {};
  for (const [k, r] of Object.entries(ranges ?? {})) out[k] = { min: r?.min ?? '', max: r?.max ?? '' };
  return out;
}
/** 드래프트 → 쿼리용 — 둘 다 빈 열은 뺀다 */
function cleanRanges(draft: Record<string, { min: string; max: string }>) {
  const out: Record<string, { min?: string; max?: string }> = {};
  for (const [k, r] of Object.entries(draft)) {
    if (!r.min && !r.max) continue;
    out[k] = { ...(r.min ? { min: r.min } : {}), ...(r.max ? { max: r.max } : {}) };
  }
  return Object.keys(out).length > 0 ? out : null;
}
// 출금/입금 열 이름 — '출금만·입금만' 토글이 어느 열에 구간을 걸지 찾는 데 쓴다
const OUT_COL_RE = /찾으신|출금/;
const IN_COL_RE = /맡기신|입금/;

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
  // 숫자 열 금액 구간(최소~최대) — 콤마 없는 숫자 문자열로 들고, 표시할 때만 콤마를 붙인다
  const [rangeDraft, setRangeDraft] = useState<Record<string, { min: string; max: string }>>(
    normalizeRanges(initialQuery.ranges)
  );
  const [qDraft, setQDraft] = useState(initialQuery.q ?? '');

  // 서버가 새 조건으로 렌더하면(출처 탭·월 이동) 목록을 갈아끼운다
  useEffect(() => {
    setQuery(initialQuery);
    setRows(initialRows);
    setHasMore(initialHasMore);
    setFilterDraft(initialQuery.filters ?? {});
    setRangeDraft(normalizeRanges(initialQuery.ranges));
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

  // 필터·구간·검색어 디바운스 — 입력이 멎고 400ms 뒤에 한 번만 조회
  useEffect(() => {
    const same =
      JSON.stringify(filterDraft) === JSON.stringify(query.filters ?? {}) &&
      JSON.stringify(cleanRanges(rangeDraft) ?? {}) === JSON.stringify(query.ranges ?? {}) &&
      qDraft === (query.q ?? '');
    if (same) return;
    const t = setTimeout(() => {
      reload({ ...query, filters: filterDraft, ranges: cleanRanges(rangeDraft), q: qDraft || null });
    }, 400);
    return () => clearTimeout(t);
  }, [filterDraft, rangeDraft, qDraft, query, reload]);

  // '출금만·입금만' 토글 — 해당 금액 열에 '1원 이상' 구간을 걸어 값 있는 행만 남긴다.
  // 열은 이름으로 찾는다(찾으신금액/출금 · 맡기신금액/입금) — 은행 외 소스엔 없으면 토글을 숨긴다.
  const outCol = useMemo(() => columns.findIndex((c) => OUT_COL_RE.test(c)), [columns]);
  const inCol = useMemo(() => columns.findIndex((c) => IN_COL_RE.test(c)), [columns]);
  const flowMode: 'all' | 'out' | 'in' = (() => {
    const has = (i: number) => i >= 0 && !!(rangeDraft[String(i)]?.min || rangeDraft[String(i)]?.max);
    if (has(outCol) && !has(inCol)) return 'out';
    if (has(inCol) && !has(outCol)) return 'in';
    return 'all';
  })();
  const setFlowMode = (mode: 'all' | 'out' | 'in') => {
    setRangeDraft((prev) => {
      const next = { ...prev };
      delete next[String(outCol)];
      delete next[String(inCol)];
      if (mode === 'out') next[String(outCol)] = { min: '1', max: '' };
      if (mode === 'in') next[String(inCol)] = { min: '1', max: '' };
      return next;
    });
  };

  // 소계 — 지금 걸린 필터·기간의 '전체 행' 기준(서버 집계, 페이징과 무관). 출금·입금 열이 있을 때만.
  const [totals, setTotals] = useState<{ count: number; sums: Record<string, number> } | null>(null);
  useEffect(() => {
    if (outCol < 0 && inCol < 0) {
      setTotals(null);
      return;
    }
    const cols = [outCol, inCol].filter((c) => c >= 0);
    const ctrl = new AbortController();
    fetch(`/api/finance/raw/totals?${rawQueryToParams(query, { cols: cols.join(',') })}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.count === 'number') setTotals(j as { count: number; sums: Record<string, number> });
      })
      .catch(() => {
        /* 소계는 부가 정보 — 실패해도 표는 그대로 */
      });
    return () => ctrl.abort();
  }, [query, outCol, inCol]);

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
        {/* 출금만·입금만 토글 — 값이 있는 행만 남긴다(해당 열 1원 이상 구간) */}
        {outCol >= 0 && inCol >= 0 && (
          <div className="inline-flex gap-1 rounded-md border border-border p-0.5">
            {(
              [
                { key: 'all', label: '전체' },
                { key: 'out', label: '출금만' },
                { key: 'in', label: '입금만' },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                onClick={() => setFlowMode(m.key)}
                className={`rounded-sm px-2 py-0.5 text-[12px] transition-colors ${
                  flowMode === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
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
        // 재조회 중엔 표를 흐리게 — 정렬·필터 응답이 몇 초 걸릴 때 '클릭이 안 먹었다'는 오해를 막는다
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
              {/* 컬럼별 필터 — 문자 열은 포함 검색, 숫자 열은 금액 구간(최소~최대) */}
              <tr className="border-b border-border bg-card">
                <th />
                <th />
                {columns.map((_, i) => (
                  <th key={i} className="px-1 py-1">
                    {numericCols[i] ? (
                      <span className="flex items-center gap-0.5 whitespace-nowrap font-normal">
                        <input
                          value={fmtDigits(rangeDraft[String(i)]?.min ?? '')}
                          onChange={(e) =>
                            setRangeDraft((prev) => {
                              const next = { ...prev };
                              const cur = { min: digitsOnly(e.target.value), max: next[String(i)]?.max ?? '' };
                              if (!cur.min && !cur.max) delete next[String(i)];
                              else next[String(i)] = cur;
                              return next;
                            })
                          }
                          placeholder="최소"
                          inputMode="numeric"
                          className="h-6 w-[76px] rounded border border-border bg-background px-1.5 text-right text-[11px] tabular-nums outline-none focus:border-foreground/40"
                        />
                        <span className="text-muted-foreground">~</span>
                        <input
                          value={fmtDigits(rangeDraft[String(i)]?.max ?? '')}
                          onChange={(e) =>
                            setRangeDraft((prev) => {
                              const next = { ...prev };
                              const cur = { min: next[String(i)]?.min ?? '', max: digitsOnly(e.target.value) };
                              if (!cur.min && !cur.max) delete next[String(i)];
                              else next[String(i)] = cur;
                              return next;
                            })
                          }
                          placeholder="최대"
                          inputMode="numeric"
                          className="h-6 w-[76px] rounded border border-border bg-background px-1.5 text-right text-[11px] tabular-nums outline-none focus:border-foreground/40"
                        />
                      </span>
                    ) : (
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
                    )}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const cells = payloadCells(r.payload, columns);
                return (
                  <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    {/* 행 = 표시 순번(정렬 기준 1부터) — 원본 파일의 행 위치가 아니라 지금 보이는 순서다 */}
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">{idx + 1}</td>
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
            {/* 소계 — 필터·기간 적용된 전체 행 기준(서버 집계). 스크롤해도 바닥에 고정 */}
            {totals && (
              <tfoot className="sticky bottom-0 z-10 bg-card">
                <tr className="border-t-2 border-border text-[12px] font-medium">
                  <td colSpan={2} className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                    소계 · {totals.count.toLocaleString('ko-KR')}행
                  </td>
                  {columns.map((_, i) => (
                    <td key={i} className="whitespace-nowrap px-2 py-2 tabular-nums text-foreground">
                      {i === outCol || i === inCol ? (totals.sums[String(i)] ?? 0).toLocaleString('ko-KR') : ''}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          <div ref={sentinel} />
          {loading && <p className="py-3 text-center text-[12px] text-muted-foreground">불러오는 중…</p>}
          {error && <p className="py-3 text-center text-[12px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
