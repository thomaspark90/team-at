import type { Candidate, PurchaseRow, PurchaseStat } from './types';

// 품목 추출(순수) — 결제 기록 상품명에서 꼬리를 떼고 같은 이름끼리 묶는다.
// 네이버페이: '상품명 @수령인' 또는 '상품명 외 1종 중 총 1개 @수령인', 쿠팡: '상품명 외 2건 @수령인' 또는 '상품명 🔍미해석'.

/** 상품명 뒤의 수령인·'외 n건'·미해석 꼬리를 뗀다. */
export function cleanProductName(raw: string | null | undefined): string {
  let s = (raw ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*🔍\s*미해석\s*$/, '');
  s = s.replace(/\s+@[^@]*$/, '');
  s = s.replace(/\s+외\s*\d+\s*종\s*중\s*총\s*\d+\s*개\s*$/, ''); // 네이버페이 옵션 묶음: '외 1종 중 총 1개'
  s = s.replace(/\s+외\s*\d+\s*(건|개|종)\s*$/, '');
  return s.trim();
}

function statOf(rows: PurchaseRow[]): PurchaseStat {
  const last = rows.reduce((a, b) => (b.date > a.date ? b : a));
  return {
    count: rows.length,
    sum: rows.reduce((n, r) => n + r.amount, 0),
    lastDate: last.date,
    lastAmount: last.amount,
    lastSeller: last.seller,
  };
}

/** 상품명별로 묶는다 — 이름이 빈 줄은 버린다. */
export function groupByName(rows: PurchaseRow[]): Map<string, PurchaseRow[]> {
  const map = new Map<string, PurchaseRow[]>();
  for (const r of rows) {
    const name = cleanProductName(r.rawName);
    if (!name) continue;
    const list = map.get(name);
    if (list) list.push(r);
    else map.set(name, [r]);
  }
  return map;
}

/** 반복 품목 후보 — minCount 회 이상 산 것만, 결제액 합계가 큰 순. skip 에 든 이름(이미 품목이거나 버린 것)은 뺀다. */
export function buildCandidates(rows: PurchaseRow[], opts: { minCount?: number; skip?: Iterable<string> } = {}): Candidate[] {
  const minCount = opts.minCount ?? 3;
  const skip = new Set(opts.skip ?? []);
  const out: Candidate[] = [];
  groupByName(rows).forEach((list, name) => {
    if (list.length < minCount || skip.has(name)) return;
    out.push({
      name,
      ...statOf(list),
      sellers: Array.from(new Set(list.map((r) => r.seller))),
      months: new Set(list.map((r) => r.date.slice(0, 7))).size,
    });
  });
  return out.sort((a, b) => b.sum - a.sum || a.name.localeCompare(b.name));
}

/** 품목에 묶인 상품명들의 구매 요약 — 기록이 없으면 null. */
export function statForNames(byName: Map<string, PurchaseRow[]>, names: string[]): PurchaseStat | null {
  const rows = names.flatMap((n) => byName.get(n) ?? []);
  return rows.length ? statOf(rows) : null;
}

/** 품목에 묶인 상품명들의 판매처별 구매 요약. */
export function sellerStats(byName: Map<string, PurchaseRow[]>, names: string[]): Map<string, PurchaseStat> {
  const bySeller = new Map<string, PurchaseRow[]>();
  for (const r of names.flatMap((n) => byName.get(n) ?? [])) {
    const list = bySeller.get(r.seller);
    if (list) list.push(r);
    else bySeller.set(r.seller, [r]);
  }
  const out = new Map<string, PurchaseStat>();
  bySeller.forEach((list, seller) => out.set(seller, statOf(list)));
  return out;
}
