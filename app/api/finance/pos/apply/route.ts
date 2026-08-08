import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { parsePosXlsx } from '@/lib/finance/pos';
import { WEATHER_SALES_CACHE_PATH } from '@/lib/garden/weatherSales';
import { parsePayhereXlsx } from '@/lib/finance/payhere';
import { brandLabel, storeLabel, type Brand } from '@/lib/finance/types';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { archiveOriginal } from '@/lib/finance/original-archive';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MIGRATION_HINT =
  'POS 매출 테이블이 아직 없어요. Supabase SQL Editor 에서 supabase/migration_pos_pnl.sql 을 먼저 실행해주세요.';
const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /Could not find the table/i.test(e.message ?? ''));

// 토스 매출리포트 → pos_sales 저장. 파일에 든 달을 upsert(덮어쓰기)하고,
// 이번 업로드에 없는 옛 행만 정리(월 단위 교체). 확정된 달은 덮어쓰기 금지.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '저장 권한이 없습니다.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const password = String(form.get('password') ?? '0000') || '0000';
  // 브랜드·지점별 별도 POS 파일 — 파일 하나 = 한 (브랜드, 지점).
  // 가든은 지점 필수(판교=페이히어, 양재천=토스), 스탭밀은 단일 매장(store='').
  const rawBrand = String(form.get('brand') ?? 'garden');
  if (rawBrand !== 'garden' && rawBrand !== 'staffmeal') {
    return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  }
  const brand: Brand = rawBrand;
  const rawStore = String(form.get('store') ?? '');
  if (rawStore !== '' && rawStore !== 'pangyo' && rawStore !== 'yangjae') {
    return NextResponse.json({ error: '지점이 올바르지 않습니다.' }, { status: 400 });
  }
  if (brand === 'garden' && rawStore === '') {
    return NextResponse.json({ error: '가든서비스 POS는 지점(판교/양재천)을 선택해야 합니다.' }, { status: 400 });
  }
  if (brand === 'staffmeal' && rawStore !== '') {
    return NextResponse.json({ error: '스탭밀은 지점 구분이 없습니다.' }, { status: 400 });
  }
  const store = brand === 'garden' ? rawStore : '';
  const posType = String(form.get('posType') ?? 'toss') === 'payhere' ? 'payhere' : 'toss';
  if (!(file instanceof File)) return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });

  let r;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    r = posType === 'payhere' ? await parsePayhereXlsx(bytes, password) : await parsePosXlsx(bytes, password);
  } catch (e) {
    return NextResponse.json({ error: `파일을 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (r.rows.length === 0) {
    return NextResponse.json({ error: '저장할 매출이 없습니다.' }, { status: 422 });
  }

  // 원본 보관 — 파서 개선 시 재업로드 요청 없이 재처리할 수 있게
  await archiveOriginal(supabase, user, file, {
    area: `pos-${brand}${store ? `-${store}` : ''}`,
    ym: r.ym,
    brand,
    store,
    note: posType,
  });

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
    return NextResponse.json({ error: `확정월 확인 실패: ${closeErr.message}` }, { status: 500 });
  }
  if (closed && closed.length > 0) {
    return NextResponse.json(
      { error: `이미 확정된 달(${closed.map((c: { ym: string }) => c.ym).join(', ')})은 덮어쓸 수 없습니다.` },
      { status: 409 },
    );
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
    if (isMissingTable(upErr)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 });
    return NextResponse.json({ error: `매출 저장 실패: ${upErr.message}` }, { status: 500 });
  }

  // 잔여 정리(비치명적): 같은 달·같은 브랜드·같은 지점인데 이번 파일엔 없는 (일×카테고리) 옛 행 제거.
  // brand·store 조건 필수 — 없으면 한 지점 업로드가 다른 지점의 같은 달 매출을 지운다.
  const { error: delErr } = await supabase
    .schema('finance')
    .from('pos_sales')
    .delete()
    .in('ym', r.yms)
    .eq('brand', brand)
    .eq('store', store)
    .lt('uploaded_at', now);

  // 품목 단위(pos_items) — 토스 파서만 items 를 만든다(페이히어는 결제 단위라 불가).
  // pos_sales 와 같은 월 단위 교체(upsert 후 잔여 정리). 테이블이 아직 없으면(마이그레이션 전)
  // 요약 저장은 이미 끝났으므로 실패로 만들지 않고 응답에만 표시한다.
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
      else return NextResponse.json({ error: `품목 매출 저장 실패: ${itemErr.message}` }, { status: 500 });
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
    'POS 매출 업로드',
    `${brandLabel(brand)}${store ? `·${storeLabel(store)}` : ''}(${posType}) · ${r.ym} ${rows.length}행`,
  );

  return NextResponse.json({
    ym: r.ym,
    yms: r.yms,
    inserted: rows.length,
    itemsInserted,
    itemsSkipped, // true = pos_items 마이그레이션 전이라 품목 저장을 건너뜀
    supply: r.totals.supply,
    excludedRows: r.excluded.rows,
    staleCleaned: !delErr,
  });
}
