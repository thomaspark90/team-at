import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { normalizeKey } from '@/lib/finance/normalize';
import { toKstWallClock } from '@/lib/finance/txTime';
import { hash } from '@/lib/finance/dedup';
import { resolvePersonalCat, applyPersonalCategory } from '@/lib/finance/personal';
import { resolveMisangCatId } from '@/lib/finance/misang';
import { recordIngestSuccess } from '@/lib/ingest-health';
import { fetchStoreRuleMap } from '@/lib/finance/storeRules';
import { buildRawRowsFromObjects, saveRawBatchSafe } from '@/lib/finance/raw';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 쿠팡 무인 수집기(로컬 Mac, launchd) 전용 적재 엔드포인트 — naverpay ingest와 동일 패턴.
// 사용자 세션이 없으므로 비밀 토큰(x-coupang-token) + service role 클라이언트로 동작한다.
// 토큰은 COUPANG_INGEST_TOKEN 전용 — 네이버페이 토큰 폴백은 파이프라인 권한 분리를 위해 제거(2026-08-08).
// 적재 규칙은 supabase/migration_coupang.sql 상단 주석 참조.

type IngestRow = {
  external_id?: string;
  paid_at: string;   // 'YYYY-MM-DD HH:mm:ss' (KST) 또는 ISO
  merchant?: string;
  product?: string;
  amount: number;
  pay_status?: string;
  brand?: string;    // 배송지 기반 자동 판정: 'staffmeal' | 'garden' (없으면 DB 기본 garden)
  branch?: string;   // 지점(1차 분류): '판교' | '양재천' | '스탭밀' — transactions.branch에 저장
  ship_to?: string;  // 수령인/배송지 요약 — channel 뒤에 붙여 분류 화면 참고 표시
};

const BRANCHES = ['판교', '양재천', '스탭밀', '개인'];

export async function POST(req: Request) {
  const token = process.env.COUPANG_INGEST_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !serviceKey) {
    return NextResponse.json({ error: '서버에 COUPANG_INGEST_TOKEN / SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.' }, { status: 500 });
  }
  if (req.headers.get('x-coupang-token') !== token) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  let rows: IngestRow[];
  try {
    const body = await req.json();
    rows = Array.isArray(body?.rows) ? body.rows : [];
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
  }
  // 금액 0(전량취소)도 통과시킨다 — 기존 적재분을 0으로 소급 정정하기 위해. 신규 0원 행은 아래 fresh에서 제외.
  const valid = rows.filter((r) => r && r.paid_at && Number(r.amount) >= 0);
  if (valid.length === 0) {
    await recordIngestSuccess('coupang', '새 건 없음'); // 빈 결과도 수집기가 돌았다는 신호
    return NextResponse.json({ saved: 0, duplicates: 0, autoClassified: 0 });
  }

  const supabase = createServiceClient(url, serviceKey, { db: { schema: 'finance' } });

  const mapped = valid.map((r, rawIdx) => {
    const merchant = (r.merchant || '쿠팡').trim();
    const isRefund = /취소|환불|반품/.test(r.pay_status || '');
    const txAt = toKstWallClock(r.paid_at);
    // 수집기가 배송지로 판정한 브랜드·지점 — 값이 유효할 때만 신뢰, 아니면 DB 기본(garden)/null
    // personal = 개인(자택 배송 등 사적 지출, 2026-07-31) — migration_personal_brand.sql 선행 필요
    const brand = r.brand === 'staffmeal' || r.brand === 'garden' || r.brand === 'personal' ? r.brand : null;
    const branch = BRANCHES.includes(String(r.branch)) ? String(r.branch) : null;
    const shipTo = typeof r.ship_to === 'string' && r.ship_to.trim() ? r.ship_to.trim().slice(0, 40) : null;
    const product = (r.product || '').trim();
    // 매장 지점 차원(store) — 배송지 판정 지점명을 깨끗한 코드로 (판교/양재천 외는 null)
    const store = branch === '판교' ? 'pangyo' : branch === '양재천' ? 'yangjae' : null;
    return {
      _explicit_brand: brand, // insert 전에 제거 — dedup 시 기존 행 brand·branch 갱신용
      _raw_idx: rawIdx, // insert 전에 제거 — 수집 원본 행(raw_rows) 역참조용
      brand: brand ?? 'garden',
      store,
      bank: 'coupang',
      source: 'coupang',
      tx_at: txAt,
      ym: txAt.slice(0, 7),
      // 상품명 + 배송지(해석됨) 또는 '🔍미해석'(주소 미조회 → 브랜드가 garden 기본 추정치).
      // 분류 화면에서 '미해석' 검색으로 수동 교정 대상을 찾을 수 있다. 해석되면 아래 소급 갱신으로 주소로 바뀐다.
      channel: [product, shipTo ? `@${shipTo}` : '🔍미해석'].filter(Boolean).join(' ') || null,
      memo: merchant,                            // 분류 단서 = 가맹점명
      amount_out: isRefund ? 0 : Math.round(Number(r.amount)),
      amount_in: isRefund ? Math.round(Number(r.amount)) : 0,
      balance: 0,
      branch,
      dedup_hash: r.external_id
        ? hash('coupang', r.external_id)
        : hash('coupang', r.paid_at, merchant, r.product ?? '', r.amount),
      // 쿠팡은 가맹점명이 전부 '쿠팡'이라 키가 하나로 뭉침 → 분류 전파가 전 행을 덮치는 사고(2026-08-08).
      // 상품명을 붙여 '반복 구매 상품' 단위로만 전파·학습되게 한다.
      normalized_key: normalizeKey(product ? `${merchant} ${product}` : merchant),
      category_id: null as number | null,
      classified_by: null,
      classified_at: null,
      upload_id: null as number | null,
    };
  });

  // 재적재 중복 차단 (dedup_hash 기존 여부 + 현재 금액 청크 조회)
  const hashes = Array.from(new Set(mapped.map((m) => m.dedup_hash)));
  const existing = new Set<string>();
  const existingRow = new Map<string, { out: number; in: number; channel: string | null }>();
  for (let i = 0; i < hashes.length; i += 100) {
    const { data } = await supabase.from('transactions').select('dedup_hash,amount_out,amount_in,channel').in('dedup_hash', hashes.slice(i, i + 100));
    (data ?? []).forEach((e: { dedup_hash: string; amount_out: number; amount_in: number; channel: string | null }) => {
      existing.add(e.dedup_hash);
      existingRow.set(e.dedup_hash, { out: e.amount_out ?? 0, in: e.amount_in ?? 0, channel: e.channel ?? null });
    });
  }
  const seen = new Set<string>();
  const fresh = mapped.filter((m) => {
    if (existing.has(m.dedup_hash) || seen.has(m.dedup_hash)) return false;
    if (m.amount_out <= 0 && m.amount_in <= 0) return false; // 신규 0원(전량취소) 행은 삽입하지 않음
    seen.add(m.dedup_hash);
    return true;
  });

  // 소급 정정 — 기존 적재분의 금액/채널이 새 계산과 다르면 갱신.
  // 금액: 쿠팡이 source of truth(정가→할인가, 부분취소 차감). 채널: 미해석→해석되면 '🔍미해석'→주소.
  let amountUpdated = 0;
  const seenAmt = new Set<string>();
  for (const m of mapped) {
    if (!existing.has(m.dedup_hash) || seenAmt.has(m.dedup_hash)) continue;
    seenAmt.add(m.dedup_hash);
    const cur = existingRow.get(m.dedup_hash);
    if (!cur) continue;
    const patch: { amount_out?: number; amount_in?: number; channel?: string | null } = {};
    if (cur.out !== m.amount_out || cur.in !== m.amount_in) { patch.amount_out = m.amount_out; patch.amount_in = m.amount_in; }
    // 채널(상품명+배송지) 갱신 — 값이 다르면 갱신하되, 이미 주소(@)가 있는 행을 '🔍미해석'으로 되돌리지는 않음.
    // (빈 채널·상품명 없던 옛 적재분 → 상품명으로 채우고, 해석되면 주소까지 반영)
    if (m.channel && cur.channel !== m.channel && !(cur.channel?.includes('@') && m.channel.includes('🔍미해석'))) patch.channel = m.channel;
    if (Object.keys(patch).length) {
      await supabase.from('transactions').update(patch).eq('dedup_hash', m.dedup_hash);
      if (patch.amount_out !== undefined) amountUpdated++;
    }
  }

  // 개인(personal) 지출은 손익 제외 '개인지출' 카테고리로 자동 분류한다(공용 헬퍼).
  const hasPersonal = mapped.some((m) => m.brand === 'personal');
  const personalCat = hasPersonal ? await resolvePersonalCat(supabase) : { personalCatId: null, excludedIds: [] };
  // 배송지 미매칭(_explicit_brand 없음) 건은 브랜드가 기본값(garden)으로 조용히 굳지 않도록
  // 학습 규칙을 건너뛰고 무조건 '미상'으로 파킹한다 — 특정 가맹점이 평소 한 브랜드로
  // 학습돼 있으면 미매칭 주문까지 조용히 같은 브랜드 지출로 섞여버리는 사고를 막기 위함(2026-08-09).
  const hasUnmatched = mapped.some((m) => !m._explicit_brand);
  const misangCatId = hasUnmatched ? await resolveMisangCatId(supabase) : null;

  // 이미 적재된 건도 브랜드·지점은 소급 갱신 — 도입 이전 적재분 백필.
  // 수집기가 배송지로 명시 판정한 건(_explicit_brand)만, 값이 다른 행만 갱신한다.
  let brandUpdated = 0;
  const dupGroups = new Map<string, { brand: string; branch: string | null; hashes: string[] }>();
  mapped.forEach((m) => {
    if (!existing.has(m.dedup_hash) || !m._explicit_brand) return;
    const key = `${m._explicit_brand}|${m.branch ?? ''}`;
    const g = dupGroups.get(key) ?? { brand: m._explicit_brand, branch: m.branch, hashes: [] };
    g.hashes.push(m.dedup_hash);
    dupGroups.set(key, g);
  });
  for (const g of Array.from(dupGroups.values())) {
    const hs = Array.from(new Set(g.hashes));
    for (let i = 0; i < hs.length; i += 100) {
      const store = g.branch === '판교' ? 'pangyo' : g.branch === '양재천' ? 'yangjae' : null;
      let q = supabase
        .from('transactions')
        .update({ brand: g.brand, branch: g.branch, store })
        .in('dedup_hash', hs.slice(i, i + 100));
      q = g.branch
        ? q.or(`brand.neq.${g.brand},branch.neq.${g.branch},branch.is.null`)
        : q.neq('brand', g.brand);
      const { data } = await q.select('id');
      brandUpdated += data?.length ?? 0;
    }
  }

  // 개인 브랜드 기존 거래를 '개인지출'로 소급 분류 — 미분류·사업계정만(손익 제외 세부분류는 보존).
  let personalCategorized = 0;
  if (personalCat.personalCatId != null) {
    const personalHashes = Array.from(
      new Set(mapped.filter((m) => m.brand === 'personal').map((m) => m.dedup_hash)),
    );
    personalCategorized = await applyPersonalCategory(supabase, personalHashes, personalCat);
  }

  if (fresh.length === 0) {
    await recordIngestSuccess('coupang', `저장 0 · 중복 ${mapped.length}`);
    return NextResponse.json({ saved: 0, duplicates: mapped.length, autoClassified: 0, brandUpdated, personalCategorized, amountUpdated });
  }

  // 학습 규칙(normalized_key → category_id)으로 자동 분류 — 규칙은 브랜드별
  const keys = Array.from(new Set(fresh.map((m) => m.normalized_key)));
  const keyToCat = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data: rules } = await supabase.from('rules').select('normalized_key,category_id,brand').in('normalized_key', keys.slice(i, i + 100));
    (rules ?? []).forEach((r: { normalized_key: string; category_id: number; brand: string }) => keyToCat.set(`${r.brand}|${r.normalized_key}`, r.category_id));
  }
  // 학습된 지점 규칙 — 배송지가 지점까지 못 짚은 가든 건을 가맹점명으로 보완(2026-08-17).
  // 브랜드가 명시 판정(_explicit_brand)된 건에만 적용 — 미매칭 건까지 덮으면 '미상' 파킹 취지가 무너진다.
  const storeCandidateKeys = fresh.filter((m) => m._explicit_brand === 'garden' && !m.store).map((m) => m.normalized_key);
  const keyToStore = await fetchStoreRuleMap(supabase, storeCandidateKeys);
  const now = new Date().toISOString();
  let autoClassified = 0;
  fresh.forEach((m) => {
    if (m._explicit_brand === 'garden' && !m.store) {
      const s = keyToStore.get(m.normalized_key);
      if (s) m.store = s;
    }
    if (!m._explicit_brand && misangCatId != null) {
      m.category_id = misangCatId;
      m.classified_at = now as never;
      autoClassified++;
      return;
    }
    const cat = keyToCat.get(`${m.brand}|${m.normalized_key}`);
    if (cat != null) {
      m.category_id = cat;
      m.classified_at = now as never;
      autoClassified++;
    } else if (m.brand === 'personal' && personalCat.personalCatId != null) {
      // 개인 지출은 학습 규칙이 없어도 '개인지출'(손익 제외)로 기본 분류
      m.category_id = personalCat.personalCatId;
      m.classified_at = now as never;
      autoClassified++;
    }
  });

  // 업로드 기록(수집 배치 추적) → 거래 저장
  const dates = fresh.map((m) => m.tx_at).sort();
  const { data: up, error: upErr } = await supabase
    .from('uploads')
    .insert({
      bank: 'coupang',
      source: 'coupang',
      row_count: fresh.length,
      period_start: dates[0]?.slice(0, 10),
      period_end: dates[dates.length - 1]?.slice(0, 10),
    })
    .select('id')
    .single();
  if (upErr || !up) {
    return NextResponse.json({ error: `업로드 기록 실패: ${upErr?.message ?? ''}` }, { status: 500 });
  }
  fresh.forEach((m) => { m.upload_id = up.id; });

  // 로우데이터 적재 — 수집기가 보낸 JSON 을 손대지 않고 그대로 남긴다. 브랜드는 행마다
  // 배송지로 갈리므로 배치 브랜드는 null('행마다 다름').
  const rawSaved = await saveRawBatchSafe(
    supabase,
    {
      source: 'coupang',
      issuer: 'coupang',
      brand: null,
      uploadId: up.id,
      periodStart: dates[0]?.slice(0, 10),
      periodEnd: dates[dates.length - 1]?.slice(0, 10),
      preScoped: true,
    },
    buildRawRowsFromObjects(valid)
  );

  const insertRows = fresh.map(({ _explicit_brand, _raw_idx, ...rest }) => ({
    ...rest,
    raw_row_id: rawSaved?.rowIdByIndex.get(_raw_idx) ?? null,
  }));
  const { error: insErr } = await supabase.from('transactions').insert(insertRows);
  if (insErr) {
    await supabase.from('uploads').delete().eq('id', up.id);
    return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });
  }

  await recordIngestSuccess('coupang', `저장 ${fresh.length} · 중복 ${mapped.length - fresh.length}`);
  return NextResponse.json({ saved: fresh.length, duplicates: mapped.length - fresh.length, autoClassified, brandUpdated, personalCategorized, amountUpdated });
}
