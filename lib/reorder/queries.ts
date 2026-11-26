import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoreId } from '@/lib/types';
import { buildCandidates, groupByName, sellerStats, statForNames } from './names';
import type { Candidate, PurchaseRow, ReorderItem, ReorderSeller, SellerStatus, Spec, SpecUnit } from './types';

// 발주 품목표 조회 — 품목·판매처 상태는 DB, 지난 구매가·횟수는 결제 기록에서 매번 계산한다.

export const CANDIDATE_MONTHS = 6;
const HISTORY_MONTHS = 12;

const monthsAgo = (n: number) => {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // KST
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

// 2026-10 이후 네이버페이 수집분 다수가 지점(store) 없이 들어온다(수령인은 '@장나은(가든 양재점)'처럼 남아 있다).
// 지점이 빈 건은 수령인 꼬리에 지점 이름이 있으면 그 지점 것으로 본다. 지점이 적힌 건은 그 값을 따른다.
const STORE_WORD: Record<StoreId, string> = { yangjae: '양재', pangyo: '판교' };

/** 그 지점으로 받은 네이버페이·쿠팡 결제 건(가든) — 최근 12개월. */
export async function loadPurchases(svc: SupabaseClient, store: StoreId): Promise<PurchaseRow[]> {
  const out: PurchaseRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc
      .from('transactions')
      .select('tx_at, memo, channel, amount_out')
      .in('bank', ['naverpay', 'coupang'])
      .eq('brand', 'garden')
      .or(`store.eq.${store},and(store.is.null,channel.ilike.*@*${STORE_WORD[store]}*)`)
      .gt('amount_out', 0)
      .gte('tx_at', monthsAgo(HISTORY_MONTHS))
      .order('tx_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      out.push({
        date: String(r.tx_at).slice(0, 10),
        seller: String(r.memo ?? '').trim() || '판매처 미상',
        rawName: String(r.channel ?? ''),
        amount: Number(r.amount_out) || 0,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type ItemRow = {
  id: number;
  store: StoreId;
  name: string;
  spec_qty: number | string | null;
  spec_unit: SpecUnit | null;
  pack_count: number;
  search_query: string;
  must_include: string[] | null;
  exclude_words: string[] | null;
  compare: boolean;
  match_names: string[] | null;
  active: boolean;
};
type SellerRow = { item_id: number; seller_name: string; status: SellerStatus; shipping_fee: number | null; url: string | null };

const specOf = (r: ItemRow): Spec | null =>
  r.spec_unit && r.spec_qty != null ? { qty: Number(r.spec_qty), unit: r.spec_unit, pack: r.pack_count } : null;

export interface ReorderBoard {
  items: ReorderItem[];
  candidates: Candidate[];
}

export async function loadBoard(svc: SupabaseClient, store: StoreId): Promise<ReorderBoard> {
  const [purchases, itemsRes, ignoredRes] = await Promise.all([
    loadPurchases(svc, store),
    svc.from('reorder_items').select('*').eq('store', store).is('deleted_at', null).order('id', { ascending: true }),
    svc.from('reorder_ignored').select('name').eq('store', store),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (ignoredRes.error) throw new Error(ignoredRes.error.message);
  const rows = (itemsRes.data ?? []) as ItemRow[];
  const sellersRes = rows.length
    ? await svc.from('reorder_sellers').select('item_id, seller_name, status, shipping_fee, url').in('item_id', rows.map((r) => r.id))
    : { data: [] as SellerRow[], error: null };
  if (sellersRes.error) throw new Error(sellersRes.error.message);
  const sellerRows = (sellersRes.data ?? []) as SellerRow[];

  const byName = groupByName(purchases);
  const items: ReorderItem[] = rows.map((r) => {
    const names = r.match_names ?? [];
    const stats = sellerStats(byName, names);
    const saved = sellerRows.filter((s) => Number(s.item_id) === Number(r.id));
    const sellerNames = Array.from(new Set([...saved.map((s) => s.seller_name), ...Array.from(stats.keys())]));
    const sellers: ReorderSeller[] = sellerNames
      .map((name) => {
        const s = saved.find((x) => x.seller_name === name);
        const st = stats.get(name);
        return {
          name,
          status: s?.status ?? 'pending',
          shippingFee: s?.shipping_fee ?? null,
          url: s?.url ?? null,
          lastDate: st?.lastDate ?? null,
          lastAmount: st?.lastAmount ?? null,
          count: st?.count ?? 0,
        };
      })
      .sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''));
    return {
      id: Number(r.id),
      store: r.store,
      name: r.name,
      spec: specOf(r),
      searchQuery: r.search_query,
      mustInclude: r.must_include ?? [],
      excludeWords: r.exclude_words ?? [],
      compare: r.compare,
      matchNames: names,
      active: r.active,
      stat: statForNames(byName, names),
      sellers,
    };
  });
  items.sort((a, b) => (b.stat?.sum ?? 0) - (a.stat?.sum ?? 0) || a.id - b.id);

  const since = monthsAgo(CANDIDATE_MONTHS);
  const skip = [...rows.flatMap((r) => r.match_names ?? []), ...(ignoredRes.data ?? []).map((r) => String(r.name))];
  const candidates = buildCandidates(purchases.filter((p) => p.date >= since), { skip });
  return { items, candidates };
}
