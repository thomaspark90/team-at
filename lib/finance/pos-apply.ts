import { del } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PosDailyCat, PosParseResult } from '@/lib/finance/pos';
import { WEATHER_SALES_CACHE_PATH } from '@/lib/garden/weatherSales';
import { brandLabel, storeLabel, type Brand } from '@/lib/finance/types';
import { logActivity } from '@/lib/finance/activity';
import { confirmedYmsOfUnit } from '@/lib/finance/monthLock';

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

export interface PlausibilityCheck {
  suspicious: boolean;
  reasons: string[];
  existingAvgDaily: number;
  newAvgDaily: number;
  existingCategories: string[];
  newCategories: string[];
}

// 다른 지점·브랜드 파일을 잘못 골라 올리는 사고 방지(2026-08-09, 판교 파일이 스탭밀로 올라가
// 11개월치 스탭밀 매출을 덮어쓴 사고 — 원본 아카이브가 그 시점엔 없어 복구 불가했다). 이 유닛의
// 최근 90일 실적과 견줘 일평균 매출이 크게 벗어나거나 카테고리 구성이 거의 안 겹치면 의심스럽다고
// 본다. 기존 자료가 없거나 적으면(대상 없음) 비교하지 않고 통과 — 신규 지점 첫 업로드를 막지 않는다.
export async function checkPlausibility(
  supabase: SupabaseClient,
  ctx: { brand: Brand; store: string },
  newRows: PosDailyCat[],
): Promise<PlausibilityCheck> {
  const empty: PlausibilityCheck = {
    suspicious: false,
    reasons: [],
    existingAvgDaily: 0,
    newAvgDaily: 0,
    existingCategories: [],
    newCategories: [],
  };
  if (newRows.length === 0) return empty;

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .schema('finance')
    .from('pos_sales')
    .select('sale_date, category, supply')
    .eq('brand', ctx.brand)
    .eq('store', ctx.store)
    .gte('sale_date', since);
  if (error || !data || data.length === 0) return empty; // 비교할 기존 자료가 없음 — 통과

  const existingDays = new Set(data.map((d) => d.sale_date as string)).size;
  const existingSupply = data.reduce((s, d) => s + Number(d.supply), 0);
  const existingAvgDaily = existingDays ? existingSupply / existingDays : 0;
  const existingCategories = Array.from(new Set(data.map((d) => d.category as string)));

  const newDays = new Set(newRows.map((r) => r.saleDate)).size;
  const newSupply = newRows.reduce((s, r) => s + r.supply, 0);
  const newAvgDaily = newDays ? newSupply / newDays : 0;
  const newCategories = Array.from(new Set(newRows.map((r) => r.category)));

  const existingCatSet = new Set(existingCategories);
  const overlap = newCategories.filter((c) => existingCatSet.has(c)).length;
  const overlapRatio = newCategories.length ? overlap / newCategories.length : 1;

  const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
  const reasons: string[] = [];
  // 기존 표본이 너무 적으면(2주 미만) 오탐 위험이 커서 스킵
  if (existingDays >= 14 && existingAvgDaily > 0) {
    const ratio = newAvgDaily / existingAvgDaily;
    if (ratio < 0.4 || ratio > 2.5) {
      reasons.push(`일평균 매출이 최근 90일 평균과 크게 달라요(기존 ${won(existingAvgDaily)}/일 · 이번 파일 ${won(newAvgDaily)}/일)`);
    }
  }
  if (existingCategories.length > 0 && overlapRatio < 0.2) {
    reasons.push(
      `카테고리 구성이 기존과 거의 안 겹쳐요(기존: ${existingCategories.slice(0, 5).join(', ')} / 이번 파일: ${newCategories.slice(0, 5).join(', ')})`,
    );
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
    existingAvgDaily,
    newAvgDaily,
    existingCategories: existingCategories.slice(0, 8),
    newCategories: newCategories.slice(0, 8),
  };
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
export type PosApplyOutcome =
  | { ok: true; body: PosApplySuccess }
  | { ok: false; status: number; error: string; needsConfirm?: PlausibilityCheck };

export async function applyPosParseResult(
  supabase: SupabaseClient,
  user: { id: string },
  ctx: { brand: Brand; store: string; posType: string; actionLabel: string; confirmMismatch?: boolean },
  r: PosParseResult,
): Promise<PosApplyOutcome> {
  const { brand, store, posType, actionLabel, confirmMismatch } = ctx;

  // 확정된 달 보호 — 확정은 (ym, brand, store) 3단위, POS 는 정확히 그 단위로 귀속.
  // 판정은 monthLock.confirmedYmsOfUnit 단일 소스(2026-08-21 C4). 테이블 미생성 환경만 허용.
  let confirmedYms: string[] = [];
  try {
    confirmedYms = await confirmedYmsOfUnit(supabase as never, { brand, store, yms: r.yms });
  } catch (e) {
    if (!isMissingTable(e as { code?: string; message?: string })) {
      return { ok: false, status: 500, error: `확정월 확인 실패: ${(e as Error).message}` };
    }
  }
  if (confirmedYms.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `이미 확정된 달(${confirmedYms.join(', ')})은 덮어쓸 수 없습니다.`,
    };
  }

  // 다른 지점·브랜드 파일을 잘못 올리는 사고 방지(2026-08-09) — 확인 없이는 저장하지 않는다.
  if (!confirmMismatch) {
    const plaus = await checkPlausibility(supabase, { brand, store }, r.rows);
    if (plaus.suspicious) {
      return {
        ok: false,
        status: 409,
        error: `이 파일이 ${brandLabel(brand)}${store ? `·${storeLabel(store)}` : ''} 기존 자료와 많이 달라요 — ${plaus.reasons.join(' · ')}`,
        needsConfirm: plaus,
      };
    }
  }

  // 이미 있는 자료와 완전히 같은 달은 재기재(재아카이브 포함)를 건너뛴다(2026-08-09).
  const dupInfo = await checkYmDuplicates(supabase, { brand, store }, r.rows);
  const dupYms = new Set(dupInfo.filter((d) => d.duplicate).map((d) => d.ym));
  const duplicateLastUploaded: Record<string, string> = {};
  for (const d of dupInfo) if (d.duplicate && d.lastUploadedAt) duplicateLastUploaded[d.ym] = d.lastUploadedAt;
  const changedYms = r.yms.filter((ym) => !dupYms.has(ym));

  const brandLine = `${brandLabel(brand)}${store ? `·${storeLabel(store)}` : ''}(${posType})`;

  // 선수금(gift) 누락 백필 — dup 판정(checkYmDuplicates)은 pos_sales 내용만 보므로, gift 테이블
  // 도입(2026-08-20) 전에 올렸던 달은 '동일'로 건너뛰어도 선수금 행이 비어 있을 수 있다
  // (실사고: 양재 2026-05~07 금액권·선불권 417만 누락, 2026-08-23). 그 달만 gift 행을 채운다.
  const giftBackfillYms = new Set<string>();
  {
    const targetYms = Array.from(new Set((r.giftRows ?? []).map((d) => d.ym))).filter((ym) => dupYms.has(ym));
    if (targetYms.length > 0) {
      const { data: haveGift } = await supabase
        .schema('finance')
        .from('pos_gift_sales')
        .select('ym')
        .eq('brand', brand)
        .eq('store', store)
        .in('ym', targetYms);
      const have = new Set(((haveGift ?? []) as { ym: string }[]).map((g) => g.ym));
      for (const ym of targetYms) if (!have.has(ym)) giftBackfillYms.add(ym);
    }
  }
  // 시간대 행(pos_item_hours) 누락 백필 — gift 와 같은 원리(2026-08-26 신설 이전에 올린 달은
  // dup 판정으로 건너뛰어도 시간대 행이 비어 있다). 그 달만 시간대 행을 채운다.
  const hoursBackfillYms = new Set<string>();
  {
    const targetYms = Array.from(new Set((r.hours ?? []).map((d) => d.ym))).filter((ym) => dupYms.has(ym));
    if (targetYms.length > 0) {
      const { data: haveHours } = await supabase
        .schema('finance')
        .from('pos_item_hours')
        .select('ym')
        .eq('brand', brand)
        .eq('store', store)
        .in('ym', targetYms);
      const have = new Set(((haveHours ?? []) as { ym: string }[]).map((g) => g.ym));
      for (const ym of targetYms) if (!have.has(ym)) hoursBackfillYms.add(ym);
    }
  }

  // 시간대 행 저장 — 대상 달 필터만 다르고 절차는 본 저장과 동일(upsert 후 잔여 정리는 호출부에서).
  const upsertHours = async (yms: Set<string>, ts: string): Promise<string | null> => {
    const rows = (r.hours ?? []).filter((d) => yms.has(d.ym));
    if (rows.length === 0) return null;
    const { error } = await supabase
      .schema('finance')
      .from('pos_item_hours')
      .upsert(
        rows.map((d) => ({
          ym: d.ym,
          sale_date: d.saleDate,
          hour: d.hour,
          brand,
          store,
          category: d.category,
          product: d.product,
          option: d.option,
          qty: d.qty,
          orders: d.orders,
          list_price: d.listPrice,
          gross: d.gross,
          vat: d.vat,
          supply: d.supply,
          uploaded_by: user.id,
          uploaded_at: ts,
        })),
        { onConflict: 'sale_date,hour,brand,store,category,product,option' },
      );
    if (error && !isMissingTable(error)) return error.message;
    return null;
  };

  const upsertGiftBackfill = async (): Promise<string | null> => {
    if (giftBackfillYms.size === 0) return null;
    const ts = new Date().toISOString();
    const giftInsert = (r.giftRows ?? [])
      .filter((d) => giftBackfillYms.has(d.ym))
      .map((d) => ({ ym: d.ym, sale_date: d.saleDate, brand, store, item: d.item, qty: d.qty, gross: d.gross, uploaded_by: user.id, uploaded_at: ts }));
    const { error } = await supabase
      .schema('finance')
      .from('pos_gift_sales')
      .upsert(giftInsert, { onConflict: 'sale_date,brand,store,item' });
    if (error && !isMissingTable(error)) return error.message;
    return null;
  };

  if (changedYms.length === 0) {
    // 요청한 모든 달이 이미 저장된 자료와 동일 — DB 쓰기·원본 재아카이브 없이 그대로 알린다.
    // 단 선수금 누락 달이 있으면 그 백필만 수행한다(위 실사고의 복구 경로).
    const giftErr = await upsertGiftBackfill();
    if (giftErr) return { ok: false, status: 500, error: `식권 판매 저장 실패: ${giftErr}` };
    const hoursErr = await upsertHours(hoursBackfillYms, new Date().toISOString());
    if (hoursErr) return { ok: false, status: 500, error: `시간대 판매 저장 실패: ${hoursErr}` };
    const giftNote = giftBackfillYms.size > 0 ? ` · 선수금 백필 ${Array.from(giftBackfillYms).join(', ')}` : '';
    await logActivity(supabase, user, actionLabel, `${brandLine} · ${r.yms.join(', ')} 전부 기존 자료와 동일 — 건너뜀${giftNote}`);
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

  // 시간대별 품목(pos_item_hours) — 토스 리포트('주문시작시각' 컬럼)만 채운다(2026-08-26).
  // pos_items 와 같은 (upsert 후 잔여 정리) 절차. 테이블 미생성이면 조용히 건너뛴다(비치명).
  {
    const targetYms = new Set([...changedYms, ...Array.from(hoursBackfillYms)]);
    const hoursErr = await upsertHours(targetYms, now);
    if (hoursErr) return { ok: false, status: 500, error: `시간대 판매 저장 실패: ${hoursErr}` };
    if (!hoursErr && (r.hours ?? []).some((d) => targetYms.has(d.ym))) {
      await supabase
        .schema('finance')
        .from('pos_item_hours')
        .delete()
        .in('ym', changedYms)
        .eq('brand', brand)
        .eq('store', store)
        .lt('uploaded_at', now);
    }
  }

  // 식권 판매(선수금) — pos_gift_sales. 매출에서 제외되는 금액을 버리지 않고 담는다(2026-08-20).
  // pos_items 와 같은 (upsert 후 잔여 정리) 절차. 테이블 미생성이면 조용히 건너뛴다(비치명).
  // dup 달이라도 선수금이 비어 있으면(giftBackfillYms) 포함 — 위 백필 규칙과 동일.
  const giftRows = (r.giftRows ?? []).filter((d) => !dupYms.has(d.ym) || giftBackfillYms.has(d.ym));
  if (giftRows.length > 0) {
    const giftInsert = giftRows.map((d) => ({
      ym: d.ym,
      sale_date: d.saleDate,
      brand,
      store,
      item: d.item,
      qty: d.qty,
      gross: d.gross,
      uploaded_by: user.id,
      uploaded_at: now,
    }));
    const { error: giftErr } = await supabase
      .schema('finance')
      .from('pos_gift_sales')
      .upsert(giftInsert, { onConflict: 'sale_date,brand,store,item' });
    if (!giftErr) {
      await supabase
        .schema('finance')
        .from('pos_gift_sales')
        .delete()
        .in('ym', changedYms)
        .eq('brand', brand)
        .eq('store', store)
        .lt('uploaded_at', now);
    } else if (!isMissingTable(giftErr)) {
      return { ok: false, status: 500, error: `식권 판매 저장 실패: ${giftErr.message}` };
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
