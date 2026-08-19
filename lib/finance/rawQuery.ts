// 로우데이터 조회 공용 로직 — 페이지(서버 컴포넌트)·행 API·CSV 내보내기가 같은 규칙을 쓰도록.
//
// 화면 단위는 "배치"가 아니라 "월"이다. 사용자는 '2026년 6월 우리은행 원본'을 보고 싶지
// '3번 배치'를 보고 싶은 게 아니기 때문. 그래서 월 → 그 달에 걸친 배치들 → 배치의 원본 행 순으로 읽는다.

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
  payload: unknown;
  /** 이 원본 행에서 만들어진 거래(있으면) — 가공 결과로 되짚어 가는 링크 */
  tx?: { id: number; category_id: number | null; amount_out: number; amount_in: number } | null;
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

/** 'YYYY-MM' → 그 달의 [첫날, 말일] */
function monthRange(ym: string): [string, string] {
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
  opts: { source: RawSource; brand?: string | null; ym?: string | null }
): Promise<RawBatchRow[]> {
  let q = supabase
    .schema('finance')
    .from('raw_batches')
    .select('id,source,issuer,brand,store,filename,header,row_count,upload_id,period_start,period_end,ingested_at')
    .eq('source', opts.source)
    .order('ingested_at', { ascending: false })
    .limit(200);

  if (opts.brand) q = q.or(`brand.eq.${opts.brand},brand.is.null`);
  if (opts.ym) {
    // 기간이 그 달과 겹치는 배치 — 여러 달이 담긴 파일도 잡히게(겹침 조건)
    const [from, to] = monthRange(opts.ym);
    q = q.or(`and(period_start.lte.${to},period_end.gte.${from}),and(period_start.is.null,period_end.is.null)`);
  }

  const { data, error } = await q;
  if (error) throw new Error(`원본 배치 조회 실패: ${error.message}`);
  return (data as RawBatchRow[] | null) ?? [];
}

/** 배치들의 원본 행을 순서대로 — 무한스크롤용 오프셋 페이징 */
export async function fetchRawRows(
  supabase: AnyClient,
  batchIds: number[],
  opts: { offset: number; limit: number }
): Promise<RawRowView[]> {
  if (batchIds.length === 0) return [];
  const { data, error } = await supabase
    .schema('finance')
    .from('raw_rows')
    .select('id,batch_id,row_index,payload')
    .in('batch_id', batchIds)
    .order('batch_id', { ascending: true })
    .order('row_index', { ascending: true })
    .range(opts.offset, opts.offset + opts.limit - 1);
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
  (txs ?? []).forEach((t: { id: number; raw_row_id: number; category_id: number | null; amount_out: number; amount_in: number }) =>
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
