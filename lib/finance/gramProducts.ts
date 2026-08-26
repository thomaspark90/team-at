// 그램 단위 판매 상품 — POS 금액을 그램으로 되돌리는 단가표 (2026-08-26).
//
// 왜 필요한가: 저울로 달아 파는 상품(가든 양재천 '브런치바')은 POS 에 그램이 아니라 '금액'만
// 남는다(수량은 항상 1접시). 그래서 담긴 양은 **정가 ÷ 그램당 단가**로 역산할 수밖에 없다.
//   - 정가(list_price, 상품가격)를 쓴다. 실판매금액(gross)은 할인·선불권 결제에서 깎이거나 0이라
//     그램이 사라진다(2026-08 실측: 전체할인 16건 · 선불권 결제 10건).
//   - 단가가 바뀌면 새 규칙을 from 과 함께 추가한다 — 과거 구간은 옛 단가로 계속 계산돼야 한다.
//
// 실측 근거(2026-08-05~23, 브런치바 862행): 상품가격이 **예외 없이 30의 배수** → 30원/g.
// 보울 추가(5,000원)는 '스프/시리얼/요거트' 상품으로 따로 찍혀서 브런치바 금액에 안 섞인다.

import type { Brand } from './types';

export interface GramProductRule {
  brand: Brand;
  store: string; // '' = 지점 구분 없음
  product: string; // pos_item_hours.product 원문과 정확히 일치
  wonPerGram: number; // VAT 포함 정가 기준
  from: string; // 적용 시작 영업일 (inclusive)
  to?: string; // 적용 종료 영업일 (inclusive) — 없으면 현재까지
  priceLabel: string; // 화면 표기용
  note?: string;
}

export const GRAM_PRODUCTS: GramProductRule[] = [
  {
    brand: 'garden',
    store: 'yangjae',
    product: '브런치바',
    wonPerGram: 30,
    from: '2026-08-05', // 판매 개시일(실측 첫 판매)
    priceLabel: '100g당 3,000원(VAT 포함)',
    note: '보울 추가(5,000원)는 별도 상품으로 찍혀서 그램 계산에 섞이지 않아요.',
  },
];

/** 이 상품이 그램 단위 판매인가 — 날짜 무관(선택기·열 표시 판정용) */
export const isGramProduct = (brand: string, store: string, product: string): boolean =>
  GRAM_PRODUCTS.some((r) => r.brand === brand && (r.store === '' || r.store === store) && r.product === product);

/** 그 영업일에 적용되는 단가 규칙 — 없으면 null(그램 열을 아예 안 그린다) */
export function gramRuleFor(
  brand: string,
  store: string,
  product: string,
  saleDate: string,
): GramProductRule | null {
  return (
    GRAM_PRODUCTS.find(
      (r) =>
        r.brand === brand &&
        (r.store === '' || r.store === store) &&
        r.product === product &&
        saleDate >= r.from &&
        (!r.to || saleDate <= r.to),
    ) ?? null
  );
}

/** 정가 합 → 그램. 규칙이 없으면 null. */
export function gramsOf(listPrice: number, rule: GramProductRule | null): number | null {
  if (!rule || !rule.wonPerGram) return null;
  return listPrice / rule.wonPerGram;
}
