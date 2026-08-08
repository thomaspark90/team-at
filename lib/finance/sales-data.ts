import type { SupabaseClient } from '@supabase/supabase-js';

// 매출 화면(스탭밀·가든) 공용 조회 — POS 매출 행을 페이지네이션으로 끝까지 가져온다.
// Supabase 응답은 요청당 1,000행 상한이라 .limit 만으로는 잘린다(날씨 API·boardTodos 와 같은 이유).

export interface SalesRow {
  sale_date: string; // 'YYYY-MM-DD'
  ym: string; // 'YYYY-MM'
  category: string;
  supply: number;
  store?: string | null; // 지점 — 스탭밀은 '' (2026-08-08 뷰에도 추가됨)
}

const PAGE = 1000;

/**
 * table 선택 기준:
 *  - 'pos_sales'      admin/classifier — RLS 직접 통과
 *  - 'dashboard_pos'  재무 멤버 전원(viewer 포함) — RLS 우회 뷰, 안전 컬럼만. store 포함(2026-08-08)
 */
export async function fetchSalesRows(
  supabase: SupabaseClient,
  opts: { table: 'pos_sales' | 'dashboard_pos'; brand: string; since: string }
): Promise<SalesRow[]> {
  const isTable = opts.table === 'pos_sales';
  const columns = 'sale_date, ym, category, supply, store';
  const rows: SalesRow[] = [];
  for (let from = 0; ; from += PAGE) {
    // 페이지 경계 중복/누락 방지 — 정렬이 유일해야 안전하다. 테이블은 id 로 보장,
    // 뷰는 id 가 없어 (일자,카테고리,지점)으로 — pos_sales 유니크 제약과 같아 브랜드 안에서 유일하다.
    let q = supabase
      .schema('finance')
      .from(opts.table)
      .select(columns)
      .eq('brand', opts.brand)
      .gte('sale_date', opts.since)
      .order('sale_date', { ascending: true });
    q = isTable ? q.order('id') : q.order('category').order('store');
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as SalesRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}
