import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoreCode } from './storeGuess';

// 세션 클라이언트(스키마 미지정)·서비스 클라이언트(finance 스키마 바인딩) 양쪽에서 호출되므로
// personal.ts·misang.ts 와 동일하게 느슨한 별칭을 쓴다. 매 호출에서 .schema('finance')를
// 명시해 어느 클라이언트로 불러도 동작하게 한다.
type AnyClient = SupabaseClient<any, any, any, any, any>;

// 가맹점(정규화 키)별 학습된 지점 — 브랜드·지점 이동 도구로 지정할 때마다 기록되고,
// 이후 신규 수집 거래(은행·카드·네이버페이·쿠팡)가 같은 가맹점이면 자동으로 채워진다(2026-08-17).
export async function fetchStoreRuleMap(supabase: AnyClient, normalizedKeys: string[]): Promise<Map<string, StoreCode>> {
  const keys = Array.from(new Set(normalizedKeys.filter(Boolean)));
  const map = new Map<string, StoreCode>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await supabase
      .schema('finance')
      .from('store_rules')
      .select('normalized_key,store')
      .eq('brand', 'garden')
      .in('normalized_key', keys.slice(i, i + 100));
    (data as { normalized_key: string; store: string }[] | null)?.forEach((r) => map.set(r.normalized_key, r.store as StoreCode));
  }
  return map;
}

// 가맹점의 지점을 학습(등록/갱신) — 사람이 '브랜드·지점 이동' 도구로 지정할 때 호출.
export async function learnStoreRule(
  supabase: AnyClient,
  normalizedKey: string,
  store: StoreCode,
  userId: string,
): Promise<void> {
  if (!normalizedKey) return;
  const { data: existing } = await supabase
    .schema('finance')
    .from('store_rules')
    .select('id,hit_count')
    .eq('normalized_key', normalizedKey)
    .eq('brand', 'garden')
    .maybeSingle();
  if (existing) {
    await supabase
      .schema('finance')
      .from('store_rules')
      .update({ store, hit_count: (existing.hit_count as number) + 1 })
      .eq('id', existing.id);
  } else {
    await supabase
      .schema('finance')
      .from('store_rules')
      .insert({ normalized_key: normalizedKey, brand: 'garden', store, created_by: userId });
  }
}
