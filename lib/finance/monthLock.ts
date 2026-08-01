import type { SupabaseClient } from '@supabase/supabase-js';

// 확정(잠금)된 달 집합 — 확정월에는 새 거래 업로드를 막는다(확정 손익 불변 + 분류 잠김 좀비 방지).
// 가든은 통장·카드 거래가 지점 미지정(store null)으로 들어가므로
// 양재천·판교가 모두 확정된 달만 잠금(지출 자료 분류의 잠금 규칙과 동일).
export async function lockedYms(supabase: SupabaseClient, brand: string): Promise<Set<string>> {
  const { data } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('ym,store,status')
    .eq('brand', brand)
    .eq('status', 'confirmed');
  const rows = data ?? [];
  if (brand !== 'garden') return new Set(rows.map((r) => String(r.ym)));
  const byYm = new Map<string, Set<string>>();
  for (const r of rows) {
    const ym = String(r.ym);
    if (!byYm.has(ym)) byYm.set(ym, new Set());
    byYm.get(ym)!.add(String(r.store ?? ''));
  }
  return new Set(
    Array.from(byYm.entries())
      .filter(([, stores]) => stores.has('yangjae') && stores.has('pangyo'))
      .map(([ym]) => ym)
  );
}
