// 로우데이터 레이어 — 파서가 읽어낸 원본 행을 변환 전 그대로 보관한다(2026-08-19).
//
// 왜 필요한가: 지금까지는 파일 → 파서 → finance.transactions 로 바로 들어가서, 파서가 잘못
// 읽어도(미트박스 부분취소 오판) 나중에 대조할 기준이 없었다. 이 모듈이 남기는 raw 행이
// "스프레드시트의 로우데이터 시트"에 해당하고, transactions 는 거기서 파생된 가공 시트가 된다.
//
// 원칙:
//  - payload 는 파서가 읽은 컬럼을 **가공 없이** 담는다. 부호 변환·분류·중복제거 전 상태.
//  - 스킵된 행(합계·제목 등)도 buildRawRows 로 함께 넣는다 — 원본 파일과 행 수가 맞아야
//    "이 행은 왜 거래가 안 됐지?"를 화면에서 되짚을 수 있다.
//  - append-only. 잘못 올린 배치는 deleteRawBatch 로 배치째 지우고 다시 올린다.

import type { SupabaseClient } from '@supabase/supabase-js';

// 호출부가 두 종류다 — 서버 컴포넌트/라우트의 public 스코프 클라이언트(.schema('finance') 로 접근)와
// 수집 라우트의 finance 스코프 service client. 제네릭 스키마 인자만 다르므로 느슨하게 받는다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

export type RawSource = 'bank' | 'card' | 'pos' | 'coupang' | 'naverpay';

export interface RawBatchInput {
  source: RawSource;
  issuer?: string | null; // 'woori' · 'shinhan' · '신한' · 'payhere' · 'toss' 등 세부 출처
  /**
   * 배치 전체의 브랜드. 쿠팡·네이버페이 수집분처럼 한 배치에 여러 브랜드가 섞여 있으면
   * null — 브랜드는 행마다 payload/가공행에서 판정된다.
   */
  brand: string | null;
  store?: string | null;
  filename?: string | null; // 업로드 파일명(수집형은 null)
  header?: unknown[] | null; // 원본 헤더 행(컬럼 순서·이름 그대로)
  uploadId?: number | null; // 대응하는 finance.uploads 배치
  originalId?: number | null; // 대응하는 finance.upload_originals(Blob 원본)
  periodStart?: string | null; // 'YYYY-MM-DD'
  periodEnd?: string | null;
  userId?: string | null;
  /**
   * 클라이언트가 이미 finance 스키마로 스코프돼 있으면 true(수집 라우트의 service client 처럼
   * `db: { schema: 'finance' }` 로 만든 경우). 기본은 supabase.schema('finance') 로 접근.
   */
  preScoped?: boolean;
}

/** 한 행의 원본 내용 — 표 형식(배열)이든 수집 JSON(객체)이든 그대로 담는다 */
export interface RawRowInput {
  rowIndex: number; // 원본 파일에서의 절대 행 번호(0-base). 수집형은 배열 순서
  payload: unknown;
  /** 행의 거래일 'YYYY-MM-DD' — 기간 조회·날짜 정렬용. 메타/헤더 행은 null.
   *  ⚠️ 적재 시 반드시 채울 것 — 백필만 믿었다가 새 적재분이 기간 필터에서 통째로 빠졌다(2026-08-20). */
  rowDate?: string | null;
}

export interface RawBatchSaved {
  batchId: number;
  /** rowIndex → finance.raw_rows.id — 가공 행에 raw_row_id 를 채울 때 쓴다 */
  rowIdByIndex: Map<number, number>;
}

const CHUNK = 500;

/**
 * 원본 행을 배치로 적재한다. 실패해도 본 저장(transactions)을 막지 않도록,
 * 호출부에서 try/catch 하거나 saveRawBatchSafe 를 쓴다.
 */
export async function saveRawBatch(
  supabase: AnyClient,
  batch: RawBatchInput,
  rows: RawRowInput[]
): Promise<RawBatchSaved> {
  const db = batch.preScoped ? supabase : supabase.schema('finance');

  const { data: created, error: batchErr } = await db
    .from('raw_batches')
    .insert({
      source: batch.source,
      issuer: batch.issuer ?? null,
      brand: batch.brand ?? null,
      store: batch.store ?? null,
      filename: batch.filename ?? null,
      header: batch.header ?? null,
      row_count: rows.length,
      upload_id: batch.uploadId ?? null,
      original_id: batch.originalId ?? null,
      period_start: batch.periodStart ?? null,
      period_end: batch.periodEnd ?? null,
      ingested_by: batch.userId ?? null,
    })
    .select('id')
    .single();
  if (batchErr || !created) throw new Error(`원본 배치 기록 실패: ${batchErr?.message ?? '알 수 없음'}`);

  const batchId = created.id as number;
  const rowIdByIndex = new Map<number, number>();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { data, error } = await db
      .from('raw_rows')
      .insert(
        slice.map((r) => ({
          batch_id: batchId,
          row_index: r.rowIndex,
          payload: r.payload as never,
          row_date: r.rowDate ?? null,
        }))
      )
      .select('id,row_index');
    if (error) {
      // 부분 적재 상태를 남기지 않는다 — 배치째 지우고 실패를 알린다
      await db.from('raw_batches').delete().eq('id', batchId);
      throw new Error(`원본 행 적재 실패: ${error.message}`);
    }
    (data ?? []).forEach((d: { id: number; row_index: number }) => rowIdByIndex.set(d.row_index, d.id));
  }

  return { batchId, rowIdByIndex };
}

/**
 * 원본 적재가 실패해도 업로드 자체는 진행시키는 래퍼.
 * raw 는 검증용 부가 기록이라, 이것 때문에 회계 자료 저장이 막히면 안 된다.
 */
export async function saveRawBatchSafe(
  supabase: AnyClient,
  batch: RawBatchInput,
  rows: RawRowInput[]
): Promise<RawBatchSaved | null> {
  try {
    return await saveRawBatch(supabase, batch, rows);
  } catch (e) {
    console.error('[raw] 원본 적재 실패 — 본 저장은 계속합니다:', (e as Error).message);
    return null;
  }
}

/** 표 형식(string[][]) 시트를 raw 행으로 — 헤더 행 포함 전 행을 그대로 담는다 */
export function buildRawRows(rows: unknown[][]): RawRowInput[] {
  return rows.map((row, i) => ({ rowIndex: i, payload: row }));
}

/** 수집형(JSON 배열)을 raw 행으로 — 수집기가 보낸 객체를 손대지 않고 담는다 */
export function buildRawRowsFromObjects(items: unknown[]): RawRowInput[] {
  return items.map((item, i) => ({ rowIndex: i, payload: item }));
}

/** 잘못 올린 배치 정리 — raw_rows 는 cascade 로 함께 삭제된다 */
export async function deleteRawBatch(
  supabase: AnyClient,
  batchId: number,
  preScoped = false
): Promise<void> {
  const db = preScoped ? supabase : supabase.schema('finance');
  await db.from('raw_batches').delete().eq('id', batchId);
}
