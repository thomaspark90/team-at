import type { SupabaseClient } from '@supabase/supabase-js';

// ingest 는 finance 스키마 서비스 클라이언트를 넘긴다(createServiceClient(..,{db:{schema:'finance'}})).
// 스키마 리터럴이 'public'이 아니라 타입이 어긋나므로, 스키마를 가리지 않는 느슨한 별칭을 쓴다.
type AnyClient = SupabaseClient<any, any, any, any, any>;

// 개인(personal) 지출 자동 분류 헬퍼 — 쿠팡·네이버 등 무인 수집기 ingest 공용.
// 개인 지출은 손익 제외 '개인지출'(excluded) 카테고리로 모은다. 단, 이미 다른 손익 제외
// 계정(자본적지출·내부이체 등)으로 분류된 건은 의도를 존중해 덮지 않는다.
// 반대로 사업 계정(원두·식자재 등 in_pnl)으로 잘못 분류된 개인 건은 개인지출로 바로잡는다.

export interface PersonalCat {
  personalCatId: number | null; // '개인지출' 카테고리 id (없으면 null → 스킵)
  excludedIds: number[]; // 손익 제외(excluded) 카테고리 id 목록 (보존 대상)
}

// '개인지출' 카테고리와 손익 제외 계정 목록을 조회. personal 거래가 없으면 호출 안 하는 게 좋다.
export async function resolvePersonalCat(supabase: AnyClient): Promise<PersonalCat> {
  const { data: exc } = await supabase.from('categories').select('id,name,type').eq('type', 'excluded');
  const rows = (exc as { id: number; name: string; type: string }[] | null) ?? [];
  const personal = rows.find((r) => r.name === '개인지출');
  return { personalCatId: personal?.id ?? null, excludedIds: rows.map((r) => r.id) };
}

// 주어진 dedup_hash 들 중 개인 거래의 카테고리를 '개인지출'로 정리한다.
// 미분류(null)이거나 손익 제외 계정이 아닌(=사업 계정) 건만 갱신 → 이미 손익 제외인 건은 보존.
export async function applyPersonalCategory(
  supabase: AnyClient,
  dedupHashes: string[],
  { personalCatId, excludedIds }: PersonalCat,
): Promise<number> {
  if (personalCatId == null || dedupHashes.length === 0) return 0;
  // 개인지출 자신은 보존 목록에서 빼도 무방(같은 값이라 갱신돼도 결과 동일)하나, or 필터 단순화를 위해 유지.
  let updated = 0;
  for (let i = 0; i < dedupHashes.length; i += 100) {
    let q = supabase
      .from('transactions')
      .update({ category_id: personalCatId })
      .in('dedup_hash', dedupHashes.slice(i, i + 100));
    // 미분류 or 손익 제외가 아닌(사업) 계정만 — 의도적 손익 제외 세부분류는 보존
    q = excludedIds.length
      ? q.or(`category_id.is.null,category_id.not.in.(${excludedIds.join(',')})`)
      : q; // 손익 제외 계정이 하나도 없으면(비정상) 전부 개인지출로
    const { data } = await q.select('id');
    updated += data?.length ?? 0;
  }
  return updated;
}
