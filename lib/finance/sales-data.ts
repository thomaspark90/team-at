import type { SupabaseClient } from '@supabase/supabase-js';

// 매출 화면(스탭밀·가든) 공용 조회 — POS 매출 행을 페이지네이션으로 끝까지 가져온다.
// Supabase 응답은 요청당 1,000행 상한이라 .limit 만으로는 잘린다(날씨 API·boardTodos 와 같은 이유).

export interface SalesRow {
  sale_date: string; // 'YYYY-MM-DD'
  ym: string; // 'YYYY-MM'
  category: string;
  supply: number;
  store?: string | null; // pos_sales 직조회에만 있음 (dashboard_pos 뷰엔 없다)
}

const PAGE = 1000;

/**
 * table 선택 기준:
 *  - 'pos_sales'      admin/classifier — RLS 통과, store(지점) 컬럼 포함
 *  - 'dashboard_pos'  viewer 멤버 — RLS 우회 뷰, 안전 컬럼만(지점 구분 없음)
 */
export async function fetchSalesRows(
  supabase: SupabaseClient,
  opts: { table: 'pos_sales' | 'dashboard_pos'; brand: string; since: string }
): Promise<SalesRow[]> {
  const isTable = opts.table === 'pos_sales';
  const columns = isTable ? 'sale_date, ym, category, supply, store' : 'sale_date, ym, category, supply';
  const rows: SalesRow[] = [];
  for (let from = 0; ; from += PAGE) {
    // 페이지 경계 중복/누락 방지 — 정렬이 유일해야 안전하다. 테이블은 id 로 보장,
    // 뷰(dashboard_pos)는 id 가 없어 (일자,카테고리,공급가액)으로 사실상 유일하게 만든다.
    let q = supabase
      .schema('finance')
      .from(opts.table)
      .select(columns)
      .eq('brand', opts.brand)
      .gte('sale_date', opts.since)
      .order('sale_date', { ascending: true });
    q = isTable ? q.order('id') : q.order('category').order('supply');
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as SalesRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}
