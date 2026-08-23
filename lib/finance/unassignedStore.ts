import type { SupabaseClient } from '@supabase/supabase-js';

// 가든 '지점 미지정'(store null) 중 **지점 손익에 실제로 영향 주는** 거래 수 (2026-08-22 감사 D12,
// 규칙 정교화 2026-08-23). 지점 필터 화면·확정 게이트가 이 수를 본다.
//
// 미지정이어도 막지 않는 것: 순수 손익 제외(excluded) 분류 — 개인 지출·자본적지출·건별분할 부모·
// 카드대금정산 등은 어느 지점 손익에도 안 들어가므로, 미지정인 채 남아도 지점 결산의 무결성을
// 해치지 않는다(실제로 대표가 '개인 지출'로 파킹한 건이 양재천 확정을 막던 문제의 처방).
// 막는 것: 미분류(성격 미정) · '미상'(excluded지만 손익에 포함되는 특수 규칙) · cogs/sga/revenue/
// non_operating(지점 손익 구성 요소).
// ⚠ 한계(문서화): 미연결 카드대금·세부 미수집 대체 출금은 excluded여도 관리손익이 lump로 되살리는
// 유형이라 엄밀히는 막아야 하지만, 그 상태 판정(uploads 연결·세부 존재)까지 여기서 하지 않는다 —
// 해당 케이스는 관리손익의 unassignedOut 경고가 별도로 잡는다.

export const isStoreBlocking = (cat: { type: string; name: string } | null | undefined): boolean =>
  !cat || cat.name === '미상' || cat.type !== 'excluded';

export async function countUnassignedGarden(supabase: SupabaseClient, ym?: string): Promise<number> {
  let q = supabase
    .schema('finance')
    .from('transactions')
    .select('id, categories(type,name)')
    .eq('brand', 'garden')
    .is('store', null)
    .limit(10000);
  if (ym) q = q.eq('ym', ym);
  const { data, error } = await q;
  if (error) throw new Error(`지점 미지정 확인 실패: ${error.message}`);
  const rows = (data ?? []) as unknown as { id: number; categories: { type: string; name: string } | null }[];
  return rows.filter((r) => isStoreBlocking(r.categories)).length;
}
