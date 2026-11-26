import type { StoreId } from '@/lib/types';

// 가든 발주(반복 발주) — 품목표 타입. 기획: docs/prd-garden-reorder.md

export type SpecUnit = 'g' | 'ml' | 'ea';

/** 규격 — 낱개 하나의 양(g·ml 로 환산, 개수 단위면 1)과 묶음 수. */
export interface Spec {
  qty: number;
  unit: SpecUnit;
  pack: number;
}

export type SellerStatus = 'trusted' | 'pending' | 'excluded';
export const SELLER_STATUS_LABEL: Record<SellerStatus, string> = { trusted: '믿는 판매처', pending: '확인 필요', excluded: '제외' };

/** 결제 기록 한 줄 — 품목 추출에 필요한 것만. */
export interface PurchaseRow {
  date: string; // YYYY-MM-DD
  seller: string;
  rawName: string; // transactions.channel 그대로
  amount: number; // 결제 총액(원)
}

export interface PurchaseStat {
  count: number;
  sum: number; // 원
  lastDate: string;
  lastAmount: number; // 가장 최근 결제 총액(원) — 수량은 기록에 없다
  lastSeller: string;
}

/** 품목 후보 — 결제 기록에서 같은 상품명으로 묶인 것. */
export interface Candidate extends PurchaseStat {
  name: string;
  sellers: string[];
  months: number;
}

export interface ReorderSeller {
  name: string;
  status: SellerStatus;
  shippingFee: number | null;
  url: string | null;
  lastDate: string | null;
  lastAmount: number | null;
  count: number;
}

export interface ReorderItem {
  id: number;
  store: StoreId;
  name: string;
  spec: Spec | null;
  searchQuery: string;
  mustInclude: string[];
  excludeWords: string[];
  compare: boolean;
  matchNames: string[];
  active: boolean;
  stat: PurchaseStat | null;
  sellers: ReorderSeller[];
}
