// 로우데이터 조회 공용 로직 — 페이지(서버 컴포넌트)·행 API·CSV 내보내기가 같은 규칙을 쓰도록.
//
// 정렬·필터·기간은 전부 서버(finance.raw_rows_page)에서 처리한다. 클라이언트에서 하면
// '지금 불러온 200행' 안에서만 정렬돼 스크롤할수록 순서가 바뀌는 거짓 표가 되기 때문.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RawSource } from './raw';

export type { RawSource };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

export interface RawBatchRow {
  id: number;
  source: RawSource;
  issuer: string | null;
  brand: string | null;
  store: string | null;
  filename: string | null;
  header: unknown[] | null;
  row_count: number;
  upload_id: number | null;
  period_start: string | null;
  period_end: string | null;
  ingested_at: string;
}

/** 화면에 뿌리는 원본 행 — payload 는 배열(표 형식) 또는 객체(수집형) */
export interface RawRowView {
  id: number;
  batch_id: number;
  row_index: number;
  row_date: string | null;
  payload: unknown;
  /** 이 원본 행에서 만들어진 거래(있으면) — 가공 결과로 되짚어 가는 링크 */
  tx?: { id: number; category_id: number | null; amount_out: number; amount_in: number } | null;
}

/** 표 정렬 상태 — 'row'=원본 순, 'date'=행 날짜, 'col'=특정 열 */
export interface RawSort {
  by: 'row' | 'date' | 'col';
  col?: number | null;
  numeric?: boolean;
  desc?: boolean;
}

/** 숫자 열 금액 구간 — 값은 콤마 없는 숫자 문자열('1000000'), 비면 그 경계 없음 */
export interface RawRange {
  min?: string | null;
  max?: string | null;
}

export interface RawQuery {
  source: RawSource;
  brand?: string | null;
  from?: string | null; // 'YYYY-MM-DD'
  to?: string | null;
  q?: string | null; // 전체 검색
  filters?: Record<string, string> | null; // { '3': '카드' } — 키는 payload 열 인덱스
  ranges?: Record<string, RawRange> | null; // { '4': {min:'1000000', max:'5000000'} } — 숫자 열 구간
  sort?: RawSort;
}

export const RAW_SOURCES: { key: RawSource; label: string }[] = [
  { key: 'bank', label: '은행' },
  { key: 'card', label: '카드' },
  { key: 'pos', label: 'POS 매출' },
  { key: 'coupang', label: '쿠팡' },
  { key: 'naverpay', label: '네이버페이' },
];

export function isRawSource(v: unknown): v is RawSource {
  return typeof v === 'string' && RAW_SOURCES.some((s) => s.key === v);
}

/** 'YYYY-MM' → 그 달의 [첫날, 말일] — 월 단축 선택이 기간으로 바뀌는 지점 */
export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
}

/**
 * 조건에 맞는 배치 목록. 브랜드가 null 인 배치(쿠팡·네이버페이처럼 여러 브랜드가 섞인 수집분)는
 * 브랜드 필터와 무관하게 포함한다 — 행 단위로 브랜드가 갈리므로 배치 수준에서 거를 수 없다.
 */
export async function fetchRawBatches(
  supabase: AnyClient,
  opts: { source: RawSource; brand?: string | null; from?: string | null; to?: string | null }
): Promise<RawBatchRow[]> {
  let q = supabase
    .schema('finance')
    .from('raw_batches')
    .select('id,source,issuer,brand,store,filename,header,row_count,upload_id,period_start,period_end,ingested_at')
    .eq('source', opts.source)
    .order('ingested_at', { ascending: false })
    .limit(200);

  if (opts.brand) q = q.or(`brand.eq.${opts.brand},brand.is.null`);
  if (opts.from && opts.to) {
    // 기간이 겹치는 배치만 — 여러 달이 담긴 파일도 잡히게
    q = q.or(
      `and(period_start.lte.${opts.to},period_end.gte.${opts.from}),and(period_start.is.null,period_end.is.null)`
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(`원본 배치 조회 실패: ${error.message}`);
  return (data as RawBatchRow[] | null) ?? [];
}

/** 금액 구간을 rpc 인자 형태로 — 빈 경계는 빼고, min/max 둘 다 비면 그 열 자체를 뺀다 */
function rpcRanges(query: RawQuery): Record<string, { min?: number; max?: number }> {
  const ranges: Record<string, { min?: number; max?: number }> = {};
  for (const [k, r] of Object.entries(query.ranges ?? {})) {
    const entry: { min?: number; max?: number } = {};
    if (r?.min && /^\d+$/.test(r.min)) entry.min = Number(r.min);
    if (r?.max && /^\d+$/.test(r.max)) entry.max = Number(r.max);
    if (entry.min != null || entry.max != null) ranges[k] = entry;
  }
  return ranges;
}

/** 소계 — 지금 걸린 필터·기간의 '전체 행' 기준 행 수 + 지정 열 합계(서버 집계, raw_rows_totals) */
export async function fetchRawTotals(
  supabase: AnyClient,
  query: RawQuery,
  cols: number[]
): Promise<{ count: number; sums: Record<string, number> }> {
  const ranges = rpcRanges(query);
  const { data, error } = await supabase.schema('finance').rpc('raw_rows_totals', {
    p_source: query.source,
    p_brand: query.brand ?? null,
    p_from: query.from ?? null,
    p_to: query.to ?? null,
    p_q: query.q ?? null,
    p_filters: query.filters && Object.keys(query.filters).length > 0 ? query.filters : null,
    p_ranges: Object.keys(ranges).length > 0 ? ranges : null,
    p_cols: cols,
  });
  if (error) throw new Error(`소계 조회 실패: ${error.message}`);
  const j = (data ?? {}) as { count?: number; sums?: Record<string, number> };
  return { count: Number(j.count ?? 0), sums: j.sums ?? {} };
}

/** 원본 행 한 페이지 — 정렬·필터·기간은 DB 함수가 처리한다 */
export async function fetchRawRows(
  supabase: AnyClient,
  query: RawQuery,
  page: { offset: number; limit: number }
): Promise<RawRowView[]> {
  const sort = query.sort ?? { by: 'row' };
  const ranges = rpcRanges(query);
  const { data, error } = await supabase.schema('finance').rpc('raw_rows_page', {
    p_source: query.source,
    p_brand: query.brand ?? null,
    p_from: query.from ?? null,
    p_to: query.to ?? null,
    p_q: query.q ?? null,
    p_filters: query.filters && Object.keys(query.filters).length > 0 ? query.filters : null,
    p_ranges: Object.keys(ranges).length > 0 ? ranges : null,
    p_sort: sort.by,
    p_sort_col: sort.by === 'col' ? (sort.col ?? null) : null,
    p_numeric: !!sort.numeric,
    p_desc: !!sort.desc,
    p_offset: page.offset,
    p_limit: page.limit,
  });
  if (error) throw new Error(`원본 행 조회 실패: ${error.message}`);

  const rows = (data as RawRowView[] | null) ?? [];
  if (rows.length === 0) return rows;

  // 이 원본 행에서 나온 거래 — "이 줄이 어떻게 가공됐나"를 같은 표에서 보여주기 위해
  const { data: txs } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,raw_row_id,category_id,amount_out,amount_in')
    .in(
      'raw_row_id',
      rows.map((r) => r.id)
    );
  const byRaw = new Map<number, RawRowView['tx']>();
  (txs ?? []).forEach(
    (t: { id: number; raw_row_id: number; category_id: number | null; amount_out: number; amount_in: number }) =>
      byRaw.set(t.raw_row_id, { id: t.id, category_id: t.category_id, amount_out: t.amount_out, amount_in: t.amount_in })
  );
  return rows.map((r) => ({ ...r, tx: byRaw.get(r.id) ?? null }));
}

/** payload 를 표 셀 배열로 — 배열이면 그대로, 객체면 헤더 순서대로 */
export function payloadCells(payload: unknown, columns: string[]): string[] {
  if (Array.isArray(payload)) return columns.map((_, i) => String(payload[i] ?? ''));
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    return columns.map((c) => (o[c] == null ? '' : String(o[c])));
  }
  return [String(payload ?? '')];
}

/** 배치들에서 표의 컬럼 목록을 뽑는다 — 표 형식은 header 행, 수집형은 payload 키 합집합 */
export function deriveColumns(batches: RawBatchRow[], sampleRows: RawRowView[]): string[] {
  const header = batches.find((b) => Array.isArray(b.header) && b.header.length > 0)?.header;
  if (header) return (header as unknown[]).map((h, i) => String(h ?? `열${i + 1}`));

  const sample = sampleRows.find((r) => r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload));
  if (sample) return Object.keys(sample.payload as Record<string, unknown>);

  const arr = sampleRows.find((r) => Array.isArray(r.payload));
  if (arr) return (arr.payload as unknown[]).map((_, i) => `열${i + 1}`);
  return [];
}

/** 표 형식(배열) 원본에서 이 열이 숫자 열인지 — 정렬 방식(숫자/문자) 판단용 */
export function isNumericColumn(rows: RawRowView[], col: number): boolean {
  let seen = 0;
  let numeric = 0;
  for (const r of rows) {
    if (!Array.isArray(r.payload)) continue;
    const v = String(r.payload[col] ?? '').trim();
    if (!v) continue;
    seen++;
    if (/^-?[0-9,]*\.?[0-9]+$/.test(v)) numeric++;
    if (seen >= 30) break;
  }
  return seen > 0 && numeric / seen > 0.7;
}
