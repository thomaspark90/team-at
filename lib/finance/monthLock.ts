import type { SupabaseClient } from '@supabase/supabase-js';

// 확정월 판정의 단일 소스 (2026-08-21 감사 C4 — 5벌 구현을 여기로 모은다).
// 세 가지 관점이 있고 각각 헬퍼가 다르다:
//  - lockedYms       : 브랜드 단위 '업로드 잠금' — 가든은 두 지점 모두 확정된 달만(통장·카드가
//                      지점 미지정으로 들어가는 자료라 한 지점만 확정이면 아직 열려 있어야 함)
//  - isUnitYmConfirmed: (ym, brand, store) 정확 단위 확정 여부 — POS 처럼 지점에 정확히
//                      귀속되는 자료용
//  - anyInvolvedUnitConfirmed: 여러 단위가 얽힌 변경(건별분할 등) — 걸친 단위 중 하나라도
//                      확정이면 차단. 지점 미지정(store null) 가든은 가든의 어느 지점 확정에도 걸림
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

/** (ym, brand, store) 정확 단위의 확정 여부 — 여러 달을 한 번에 검사한다(yms 배열) */
export async function confirmedYmsOfUnit(
  supabase: SupabaseClient,
  p: { brand: string; store: string; yms: string[] }
): Promise<string[]> {
  const { data, error } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('ym,status')
    .in('ym', p.yms)
    .eq('brand', p.brand)
    .eq('store', p.store)
    .eq('status', 'confirmed');
  if (error) throw error;
  return ((data ?? []) as { ym: string }[]).map((r) => r.ym);
}

/** 얽힌 단위들 중 하나라도 확정인가 — 지점 미지정(store null) 가든은 어느 지점 확정에도 걸린다 */
export async function anyInvolvedUnitConfirmed(
  supabase: SupabaseClient,
  ym: string,
  involved: { brand: string; store: string | null }[]
): Promise<boolean> {
  const { data } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('ym,brand,store,status')
    .eq('ym', ym)
    .eq('status', 'confirmed');
  const closedRows = (data ?? []) as { brand?: string; store?: string | null }[];
  const unitClosed = (brand: string, store: string | null) =>
    closedRows.some(
      (c) =>
        (c.brand ?? 'garden') === brand &&
        (brand !== 'garden' || store == null || (c.store || '') === store)
    );
  return involved.some((u) => unitClosed(u.brand, u.store));
}
