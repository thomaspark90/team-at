import type { SupabaseClient } from '@supabase/supabase-js';

type AnyClient = SupabaseClient<any, any, any, any, any>;

// '미상' 파킹 카테고리 id 조회 — 이름으로 찾는다(분류 화면 ClassifyPanel의 misangCat 감지와 동일 규칙).
// 배송지 미매칭 등 자동판정 불가 건을 그때그때 만든 임시 카테고리에 기대지 않기 위함.
export async function resolveMisangCatId(supabase: AnyClient): Promise<number | null> {
  const { data } = await supabase.from('categories').select('id,name').like('name', '%미상%').limit(1);
  const rows = (data as { id: number; name: string }[] | null) ?? [];
  return rows[0]?.id ?? null;
}
