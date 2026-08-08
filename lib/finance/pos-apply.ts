import { del } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PosParseResult } from '@/lib/finance/pos';
import { WEATHER_SALES_CACHE_PATH } from '@/lib/garden/weatherSales';
import { brandLabel, storeLabel, type Brand } from '@/lib/finance/types';
import { logActivity } from '@/lib/finance/activity';

// POS 파싱 결과 → pos_sales/pos_items 저장 — 업로드(pos/apply)와 원본 재처리(originals/[id]/reprocess)
// 가 공유하는 핵심 로직. 파싱만 다르고(파일 vs 보관된 Blob) 저장 절차는 완전히 동일해야 한다.

const MIGRATION_HINT =
  'POS 매출 테이블이 아직 없어요. Supabase SQL Editor 에서 supabase/migration_pos_pnl.sql 을 먼저 실행해주세요.';
const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /Could not find the table/i.test(e.message ?? ''));

export interface PosApplySuccess {
  ym: string;
  yms: string[];
  inserted: number;
  itemsInserted: number;
  itemsSkipped: boolean;
  supply: number;
  excludedRows: number;
  staleCleaned: boolean;
}
export type PosApplyOutcome = { ok: true; body: PosApplySuccess } | { ok: false; status: number; error: string };

export async function applyPosParseResult(
  supabase: SupabaseClient,
  user: { id: string },
  ctx: { brand: Brand; store: string; posType: string; actionLabel: string },
  r: PosParseResult,
): Promise<PosApplyOutcome> {
  const { brand, store, posType, actionLabel } = ctx;

  // 확정된 달 보호 — 확정은 (ym, brand, store) 3단위, POS 는 정확히 그 단위로 귀속
  const { data: closed, error: closeErr } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('ym,status')
    .in('ym', r.yms)
    .eq('brand', brand)
    .eq('store', store)
    .eq('status', 'confirmed');
  if (closeErr && !isMissingTable(closeErr)) {
    return { ok: false, status: 500, error: `확정월 확인 실패: ${closeErr.message}` };
  }
  if (closed && closed.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `이미 확정된 달(${closed.map((c: { ym: string }) => c.ym).join(', ')})은 덮어쓸 수 없습니다.`,
    };
  }

  const now = new Date().toISOString();
  const rows = r.rows.map((d) => ({
    ym: d.ym,
    sale_date: d.saleDate,
    category: d.category,
    brand,
    store,
    qty: d.qty,
    gross: d.gross,
    vat: d.vat,
    supply: d.supply,
    uploaded_by: user.id,
    uploaded_at: now,
  }));

  // 월 단위 교체 = upsert(있으면 덮어쓰기) 후, 이번 업로드에 없는 옛 행만 정리.
  // 삭제-먼저 방식과 달리 테이블이 비어 있어도/재업로드도 안전.
  const { error: upErr } = await supabase
    .schema('finance')
    .from('pos_sales')
    .upsert(rows, { onConflict: 'sale_date,category,brand,store' });
  if (upErr) {
    if (isMissingTable(upErr)) return { ok: false, status: 400, error: MIGRATION_HINT };
    return { ok: false, status: 500, error: `매출 저장 실패: ${upErr.message}` };
  }

  // 잔여 정리(비치명적): 같은 달·같은 브랜드·같은 지점인데 이번 파일엔 없는 (일×카테고리) 옛 행 제거.
  const { error: delErr } = await supabase
    .schema('finance')
    .from('pos_sales')
    .delete()
    .in('ym', r.yms)
    .eq('brand', brand)
    .eq('store', store)
    .lt('uploaded_at', now);

  // 품목 단위(pos_items) — 토스 파서만 items 를 만든다(페이히어는 결제 단위라 불가).
  let itemsInserted = 0;
  let itemsSkipped = false;
  if (r.items && r.items.length > 0) {
    const itemRows = r.items.map((d) => ({
      ym: d.ym,
      sale_date: d.saleDate,
      brand,
      store,
      category: d.category,
      product: d.product,
      option: d.option,
      qty: d.qty,
      gross: d.gross,
      vat: d.vat,
      supply: d.supply,
      uploaded_by: user.id,
      uploaded_at: now,
    }));
    const { error: itemErr } = await supabase
      .schema('finance')
      .from('pos_items')
      .upsert(itemRows, { onConflict: 'sale_date,brand,store,category,product,option' });
    if (itemErr) {
      if (isMissingTable(itemErr)) itemsSkipped = true;
      else return { ok: false, status: 500, error: `품목 매출 저장 실패: ${itemErr.message}` };
    } else {
      itemsInserted = itemRows.length;
      await supabase
        .schema('finance')
        .from('pos_items')
        .delete()
        .in('ym', r.yms)
        .eq('brand', brand)
        .eq('store', store)
        .lt('uploaded_at', now);
    }
  }

  // 가든 매출이 바뀌면 날씨×판매 분석 캐시(24h)를 무효화 — 다음 조회 때 새로 계산된다
  if (brand === 'garden') {
    try {
      await del(WEATHER_SALES_CACHE_PATH);
    } catch {
      // 캐시가 없거나 삭제 실패 — 분석은 TTL 만료 후 자연 갱신되므로 무시
    }
  }

  await logActivity(
    supabase,
    user,
    actionLabel,
    `${brandLabel(brand)}${store ? `·${storeLabel(store)}` : ''}(${posType}) · ${r.ym} ${rows.length}행`,
  );

  return {
    ok: true,
    body: {
      ym: r.ym,
      yms: r.yms,
      inserted: rows.length,
      itemsInserted,
      itemsSkipped,
      supply: r.totals.supply,
      excludedRows: r.excluded.rows,
      staleCleaned: !delErr,
    },
  };
}
