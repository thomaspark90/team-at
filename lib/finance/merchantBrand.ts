import type { SupabaseClient } from '@supabase/supabase-js';

// 세션 클라이언트(스키마 미지정)·서비스 클라이언트(finance 스키마 바인딩) 양쪽에서 호출되므로
// storeRules.ts·personal.ts 와 동일하게 느슨한 별칭을 쓰고 매 호출에서 .schema('finance')를 명시한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

export interface MerchantBrandRule {
  brand: 'staffmeal' | 'garden' | 'personal';
  branch: string | null; // 확정 이력이 전부 같은 지점일 때만 (아니면 null)
  store: 'pangyo' | 'yangjae' | null;
  evidence: number; // 근거가 된 확정 거래 수
}

// 자동 판정(brand_basis='merchant')에 필요한 최소 확정 이력 수. 이 미만이면 판정하지 않고
// 분류 화면의 힌트 배지로만 보여준다 — 한두 건 우연으로 굳는 걸 막는 보수 기준.
export const MERCHANT_MIN_EVIDENCE = 3;

// 가맹점(정규화 키) 사전 — 배송지가 없는 결제(네이버 간편결제·디지털 상품 등)의 브랜드 2차 판정.
// 근거는 '확정 귀속' 행만 센다: shipping(배송지 판정)과 manual(사용자 확정). merchant 판정
// 자체는 근거에서 제외해 자기 강화(한 번의 오판이 이력을 불려 다시 근거가 되는 것)를 막는다.
// 확정 이력이 100% 한 브랜드인 가맹점만 사전에 오른다 — 이력이 갈리면 아예 제외.
export async function fetchMerchantBrandMap(
  supabase: AnyClient,
  normalizedKeys: string[],
): Promise<Map<string, MerchantBrandRule>> {
  const keys = Array.from(new Set(normalizedKeys.filter(Boolean)));
  if (!keys.length) return new Map();

  type Row = { normalized_key: string; brand: string; branch: string | null; store: string | null };
  const rows: Row[] = [];
  for (let i = 0; i < keys.length; i += 50) {
    const { data } = await supabase
      .schema('finance')
      .from('transactions')
      .select('normalized_key,brand,branch,store')
      .in('brand_basis', ['shipping', 'manual'])
      .in('normalized_key', keys.slice(i, i + 50))
      .limit(20000);
    rows.push(...((data as Row[] | null) ?? []));
  }

  const byKey = new Map<string, Row[]>();
  rows.forEach((r) => {
    const list = byKey.get(r.normalized_key) ?? [];
    list.push(r);
    byKey.set(r.normalized_key, list);
  });

  const map = new Map<string, MerchantBrandRule>();
  byKey.forEach((list, key) => {
    // 이스트파크(가든 지점 운영 전 이전 브랜드)는 가든 계열로 합산 — 시대만 다르고 같은 사업장이라
    // 이력이 갈린 것으로 치지 않는다. 최종 귀속은 ingest 쪽 시대 보정(gardenEraBrand)이 가른다.
    const brands = new Set(list.map((r) => (r.brand === 'eastpark' ? 'garden' : r.brand)));
    if (brands.size !== 1) return; // 이력이 갈리는 가맹점은 사전에서 제외
    const brand = Array.from(brands)[0];
    if (brand !== 'staffmeal' && brand !== 'garden' && brand !== 'personal') return;
    const branches = new Set(list.map((r) => r.branch ?? ''));
    const stores = new Set(list.map((r) => r.store ?? ''));
    const store = stores.size === 1 ? list[0].store : null;
    map.set(key, {
      brand,
      branch: branches.size === 1 ? list[0].branch : null,
      store: store === 'pangyo' || store === 'yangjae' ? store : null,
      evidence: list.length,
    });
  });
  return map;
}
