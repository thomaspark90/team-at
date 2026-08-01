import type { SupabaseClient } from '@supabase/supabase-js';

// 브랜드별 사용 은행 설정 (finance.brand_settings) — 설정 화면에서 관리.
// '알려진 은행' = PDF 파서가 있는 은행(신한·우리). 설정은 이 중 어떤 걸 쓰는지만 고를 수 있고,
// 새 은행 추가는 파서 개발이 필요하다 (lib/finance/parse.ts).

export const KNOWN_BANKS: { value: 'shinhan' | 'woori'; label: string }[] = [
  { value: 'shinhan', label: '신한은행' },
  { value: 'woori', label: '우리은행' },
];
export const ALL_BANK_VALUES: string[] = KNOWN_BANKS.map((b) => b.value);

// 브랜드의 사용 은행 목록 — 행이 없거나 테이블 미생성(마이그레이션 전)이면 전체 은행으로 폴백.
export async function getBrandBanks(supabase: SupabaseClient, brand: string): Promise<string[]> {
  const { data, error } = await supabase
    .schema('finance')
    .from('brand_settings')
    .select('banks')
    .eq('brand', brand)
    .maybeSingle();
  const banks = (data?.banks as string[] | null) ?? null;
  if (error || !banks || banks.length === 0) return [...ALL_BANK_VALUES];
  return banks;
}
