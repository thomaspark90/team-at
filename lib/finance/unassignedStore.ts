import type { SupabaseClient } from '@supabase/supabase-js';

// 가든 '지점 미지정'(store null) 거래 수 — 지점 뷰가 조용히 빼는 몫(2026-08-22 감사 D12).
// 통장·카드가 지점 미지정으로 들어오는 구조라, 지점 필터 화면(전처리·결산)은 이 거래들을
// 경고 없이 제외하고 있었다(월별 요약·관리손익만 경고). 같은 배너를 전 화면에 통일한다.
export async function countUnassignedGarden(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('brand', 'garden')
    .is('store', null);
  return count ?? 0;
}
