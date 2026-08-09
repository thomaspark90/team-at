import { del } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PosDailyCat, PosParseResult } from '@/lib/finance/pos';
import { WEATHER_SALES_CACHE_PATH } from '@/lib/garden/weatherSales';
import { brandLabel, storeLabel, type Brand } from '@/lib/finance/types';
import { logActivity } from '@/lib/finance/activity';

// POS 파싱 결과 → pos_sales/pos_items 저장 — 업로드(pos/apply)와 원본 재처리(originals/[id]/reprocess)
// 가 공유하는 핵심 로직. 파싱만 다르고(파일 vs 보관된 Blob) 저장 절차는 완전히 동일해야 한다.

const MIGRATION_HINT =
  'POS 매출 테이블이 아직 없어요. Supabase SQL Editor 에서 supabase/migration_pos_pnl.sql 을 먼저 실행해주세요.';
const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /Could not find the table/i.test(e.message ?? ''));

export interface YmDupInfo {
  ym: string;
  duplicate: boolean;
  lastUploadedAt: string | null;
}

// 같은 달을 다시 올렸을 때 내용이 실제로 바뀐 건지 판별 — 완전히 같으면 재기재(재아카이브)를
// 건너뛴다(2026-08-09, 같은 파일 두 번 업로드하면 원본 자료함에 거의 같은 파일이 쌓이는 문제 지적).
// 오차 허용은 아주 타이트하게 잡는다 — 같은 파일 재업로드는 결정적 파싱이라 오차가 없어야 정상이고,
// 다른 리포트 형식(예: 결제 요약 vs 상품별 조회)으로 재산출한 값은 VAT 산식이 달라 쉽게 갈리므로
// 느슨하게 잡으면 서로 다른 데이터를 '중복'으로 오판할 수 있다.
export async function checkYmDuplicates(
  supabase: SupabaseClient,
  ctx: { brand: Brand; store: string },
  newRows: PosDailyCat[],
): Promise<YmDupInfo[]> {
  const yms = Array.from(new Set(newRows.map((r) => r.ym)));
  if (yms.length === 0) return [];
  const { data, error } = await supabase
    .schema('finance')
    .from('pos_sales')
    .select('ym, supply, qty, uploaded_at')
    .in('ym', yms)
    .eq('brand', ctx.brand)
    .eq('store', ctx.store);
  if (error || !data) return yms.map((ym) => ({ ym, duplicate: false, lastUploadedAt: null }));

  const existing = new Map<string, { supply: number; qty: number; rows: number; lastUploadedAt: string }>();
  for (const row of data as { ym: string; supply: number; qty: number; uploaded_at: string }[]) {
    const c = existing.get(row.ym) ?? { supply: 0, qty: 0, rows: 0, lastUploadedAt: row.uploaded_at };
    c.supply += Number(row.supply);
    c.qty += Number(row.qty);
    c.rows += 1;
    if (row.uploaded_at > c.lastUploadedAt) c.lastUploadedAt = row.uploaded_at;
    existing.set(row.ym, c);
  }

  const fresh = new Map<string, { supply: number; qty: number; rows: number }>();
  for (const r of newRows) {
    const c = fresh.get(r.ym) ?? { supply: 0, qty: 0, rows: 0 };
    c.supply += Number(r.supply);
    c.qty += Number(r.qty);
    c.rows += 1;
    fresh.set(r.ym, c);
  }

  return yms.map((ym) => {
    const ex = existing.get(ym);
    const nw = fresh.get(ym);
    const duplicate =
      !!ex && !!nw && ex.rows === nw.rows && ex.qty === nw.qty && Math.abs(ex.supply - nw.supply) <= 100;
    return { ym, duplicate, lastUploadedAt: ex?.lastUploadedAt ?? null };
  });
}

export interface PosApplySuccess {
  ym: string;
  yms: string[];
  inserted: number;
  itemsInserted: number;
  itemsSkipped: boolean;
  supply: number;
  excludedRows: number;
  staleCleaned: boolean;
  // 이미 있는 자료와 완전히 같아 재기재를 건너뛴 달 / 이번에 실제로 반영된 달(2026-08-09)
  duplicateYms: string[];
  duplicateLastUploaded: Record<string, string>;
  changedYms: string[];
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

  // 이미 있는 자료와 완전히 같은 달은 재기재(재아카이브 포함)를 건너뛴다(2026-08-09).
  const dupInfo = await checkYmDuplicates(supabase, { brand, store }, r.rows);
  const dupYms = new Set(dupInfo.filter((d) => d.duplicate).map((d) => d.ym));
  const duplicateLastUploaded: Record<string, string> = {};
  for (const d of dupInfo) if (d.duplicate && d.lastUploadedAt) duplicateLastUploaded[d.ym] = d.lastUploadedAt;
  const changedYms = r.yms.filter((ym) => !dupYms.has(ym));

  const brandLine = `${brandLabel(brand)}${store ? `·${storeLabel(store)}` : ''}(${posType})`;

  if (changedYms.length === 0) {
    // 요청한 모든 달이 이미 저장된 자료와 동일 — DB 쓰기·원본 재아카이브 없이 그대로 알린다.
    await logActivity(supabase, user, actionLabel, `${brandLine} · ${r.yms.join(', ')} 전부 기존 자료와 동일 — 건너뜀`);
    return {
      ok: true,
      body: {
        ym: r.ym,
        yms: r.yms,
        inserted: 0,
        itemsInserted: 0,
        itemsSkipped: false,
        supply: r.totals.supply,
        excludedRows: r.excluded.rows,
        staleCleaned: true,
        duplicateYms: Array.from(dupYms),
        duplicateLastUploaded,
        changedYms: [],
      },
    };
  }

  const now = new Date().toISOString();
  const rows = r.rows.filter((d) => !dupYms.has(d.ym)).map((d) => ({
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
  // 중복이라 건드리지 않은 달(changedYms 밖)은 범위에서 뺀다 — 안 그러면 이번에 새로 안 쓴
  // 그 달의 기존 행이 "옛 행"으로 오인돼 지워진다.
  const { error: delErr } = await supabase
    .schema('finance')
    .from('pos_sales')
    .delete()
    .in('ym', changedYms)
    .eq('brand', brand)
    .eq('store', store)
    .lt('uploaded_at', now);

  // 품목 단위(pos_items) — 토스·페이히어(상품별 조회) 파서만 items 를 만든다.
  let itemsInserted = 0;
  let itemsSkipped = false;
  const items = (r.items ?? []).filter((d) => !dupYms.has(d.ym));
  if (items.length > 0) {
    const itemRows = items.map((d) => ({
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
        .in('ym', changedYms)
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

  const skipNote = dupYms.size > 0 ? ` · 동일 자료 ${dupYms.size}개월 건너뜀(${Array.from(dupYms).join(', ')})` : '';
  await logActivity(supabase, user, actionLabel, `${brandLine} · ${changedYms.join(', ')} ${rows.length}행${skipNote}`);

  return {
    ok: true,
    body: {
      ym: r.ym,
      yms: r.yms,
      inserted: rows.length,
      itemsInserted,
      itemsSkipped,
      supply: rows.reduce((s, d) => s + d.supply, 0),
      excludedRows: r.excluded.rows,
      staleCleaned: !delErr,
      duplicateYms: Array.from(dupYms),
      duplicateLastUploaded,
      changedYms,
    },
  };
}
