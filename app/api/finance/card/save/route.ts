import { NextResponse } from 'next/server';
import { parseCardXlsx } from '@/lib/finance/card';
import { dedupe } from '@/lib/finance/parse';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { archiveOriginal } from '@/lib/finance/original-archive';
import { fetchStoreRuleMap } from '@/lib/finance/storeRules';
import { lockedYms } from '@/lib/finance/monthLock';
import { CARD_STATEMENT_SUBST } from '@/lib/finance/cardOffset';
import { buildRawRows, saveRawBatchSafe } from '@/lib/finance/raw';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 카드 이용내역 저장 + (선택) 은행 카드결제 건과 정산 연결.
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
  const settledRaw = form.get('settledTxId');
  const settledTxId = settledRaw ? Number(settledRaw) : null;
  if (!(file instanceof File)) return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });
  // 카드도 브랜드별 분리 — 브랜드별 업로드 페이지가 명시(미지정=garden, 기존 동작 유지)
  const brand = String(form.get('brand') ?? 'garden');
  if (brand !== 'garden' && brand !== 'staffmeal') {
    return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  }

  let result;
  try {
    result = parseCardXlsx(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: `엑셀을 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (result.totalRows === 0) {
    return NextResponse.json({ error: '이용내역을 읽지 못했습니다.' }, { status: 422 });
  }

  // 원본 보관 — 재파싱 대비. 실패는 응답에 드러낸다(2026-08-22 감사 A6)
  const cardDates = result.transactions.map((t) => t.txAt).sort();
  const originalArchived = await archiveOriginal(supabase, user, file, {
    area: `card-${brand}`,
    ym: cardDates[0]?.slice(0, 7),
    brand,
    note: '신한카드',
  });

  // 로우데이터 적재 — dedup 앞(재업로드로 과거 파일 원본을 소급 보관하는 경로, 은행 엑셀과 동일 규칙).
  // 카드 명세는 raw 미연결 소스였다(2026-08-21 감사 B6 수정).
  const rawSaved = result.raw
    ? await saveRawBatchSafe(
        supabase,
        {
          source: 'card',
          issuer: 'shinhan',
          brand,
          filename: file.name,
          header: result.raw.header,
          periodStart: cardDates[0]?.slice(0, 10),
          periodEnd: cardDates[cardDates.length - 1]?.slice(0, 10),
          userId: user.id,
        },
        buildRawRows(result.raw.rows).map((r) => ({ ...r, rawDate: result.raw!.dates[r.rowIndex] ?? null }))
      )
    : null;

  // 신규만
  const allHashes = result.transactions.map((t) => t.dedupHash);
  const existing = await fetchExistingHashes(supabase, allHashes);
  const { fresh: freshAll, duplicates } = dedupe(result.transactions, existing);

  // 중복 건도 원본에 소급 연결(은행 엑셀과 동일 — raw 도입 전 적재분이 영영 안 이어지는 문제 방지)
  if (rawSaved) {
    const dupLinks = result.transactions
      .filter((t) => existing.has(t.dedupHash) && t.rawRowIndex != null)
      .map((t) => ({ hash: t.dedupHash, rawId: rawSaved.rowIdByIndex.get(t.rawRowIndex!) }))
      .filter((d): d is { hash: string; rawId: number } => d.rawId != null);
    if (dupLinks.length > 0) {
      const { error: linkErr } = await supabase.schema('finance').rpc('link_raw_rows', {
        p_hashes: dupLinks.map((d) => d.hash),
        p_raw_ids: dupLinks.map((d) => d.rawId),
      });
      if (linkErr) console.error('[raw] 카드 중복분 원본 연결 실패:', linkErr.message);
    }
  }

  // 확정월 가드 — 확정된 달의 카드 건은 저장하지 않는다(은행 엑셀과 동일한 409 규칙, 2026-08-22 감사)
  const locked = await lockedYms(supabase, brand);
  const blockedMonths = Array.from(new Set(freshAll.filter((t) => locked.has(t.ym)).map((t) => t.ym))).sort();
  const fresh = freshAll.filter((t) => !locked.has(t.ym));
  const blockedConfirmed = freshAll.length - fresh.length;
  if (fresh.length === 0 && blockedConfirmed > 0) {
    return NextResponse.json(
      { error: `확정된 달(${blockedMonths.join(', ')})의 카드 건만 있어요. 월 확정을 재오픈한 뒤 올려주세요.` },
      { status: 409 }
    );
  }

  const net = result.sumOut - result.sumIn;

  // 정산 대상 계정 확인(있을 때만) — 실제 잠금은 카드 건 저장이 끝난 뒤 마지막에 한다.
  let settleCatId: number | null = null;
  if (settledTxId) {
    const { data: cat } = await supabase
      .schema('finance')
      .from('categories')
      .select('id')
      .eq('type', 'excluded')
      .eq('name', '카드대금정산')
      .maybeSingle();
    if (!cat) {
      return NextResponse.json(
        { error: "'카드대금정산' 계정과목이 없습니다. 마이그레이션 SQL을 먼저 실행하세요." },
        { status: 400 }
      );
    }
    settleCatId = cat.id as number;
  }

  // 1) 카드 건 저장 먼저(업로드 기록 → 거래). 카드는 자동 확정 안 함 — 전부 미분류로 저장.
  //    (학습된 가맹점은 지출 자료 분류 화면에서 '추천'으로 미리 선택돼 보임)
  let uploadId: number | null = null;
  let substClassifiedTotal = 0;
  if (fresh.length > 0) {
    const dates = fresh.map((t) => t.txAt).sort();
    const { data: up, error: upErr } = await supabase
      .schema('finance')
      .from('uploads')
      .insert({
        bank: 'shinhan',
        source: 'card',
        card_issuer: '신한',
        brand,
        row_count: fresh.length,
        uploaded_by: user.id,
        period_start: dates[0]?.slice(0, 10),
        period_end: dates[dates.length - 1]?.slice(0, 10),
        settled_tx_id: settledTxId,
        statement_total: net,
      })
      .select('id')
      .single();
    if (upErr || !up) {
      return NextResponse.json({ error: `업로드 기록 실패: ${upErr?.message ?? ''}` }, { status: 500 });
    }
    uploadId = up.id;

    // 학습된 지점 규칙(가든 공용 카드라 지점을 모름 — 가맹점명으로 채워본다, 2026-08-17)
    const cardKeys = Array.from(new Set(fresh.map((t) => t.normalizedKey)));
    const keyToStore = brand === 'garden' ? await fetchStoreRuleMap(supabase, cardKeys) : new Map();

    // 명세 ↔ 수집분 자동 상쇄(2026-08-22 감사 D3) — 네이버페이·쿠팡 가맹점 행은 수집분(세부)과
    // 같은 돈이라, '대체' 계정(excluded)으로 자동 분류해 이중계상을 구조로 막는다(수동 분류 대체).
    // 가맹점명 정확 일치만(CARD_STATEMENT_SUBST — 쿠팡이츠는 수집기 밖이라 제외).
    const needSubst = fresh.some((t) => CARD_STATEMENT_SUBST[t.memo] != null);
    const substCatId: Record<'coupang' | 'naverpay', number | null> = { coupang: null, naverpay: null };
    if (needSubst) {
      const { data: substCats } = await supabase
        .schema('finance')
        .from('categories')
        .select('id,name')
        .eq('type', 'excluded')
        .in('name', ['쿠팡대체', '네이버페이대체']);
      for (const c of (substCats ?? []) as { id: number; name: string }[]) {
        if (c.name === '쿠팡대체') substCatId.coupang = c.id;
        else substCatId.naverpay = c.id;
      }
    }
    const now = new Date().toISOString();

    const rows = fresh.map((t) => ({
      bank: 'shinhan',
      source: 'card',
      card_issuer: '신한',
      brand,
      store: keyToStore.get(t.normalizedKey) ?? null,
      is_installment: !!t.isInstallment,
      tx_at: t.txAt,
      ym: t.ym,
      channel: t.channel,
      memo: t.memo,
      amount_out: t.amountOut,
      amount_in: t.amountIn,
      balance: 0,
      branch: null,
      dedup_hash: t.dedupHash,
      normalized_key: t.normalizedKey,
      approval_no: t.approvalNo ?? null,
      // 카드는 자동 확정 안 함(분류 화면에서 직접) — 예외: 네이버페이·쿠팡 가맹점 행은
      // 수집분과의 이중계상 차단을 위해 '대체' 계정으로 자동 분류(D3)
      ...(() => {
        const kind = CARD_STATEMENT_SUBST[t.memo];
        const catId = kind ? substCatId[kind] : null;
        if (catId != null) {
          substClassifiedTotal++;
          return { category_id: catId, classified_by: user.id, classified_at: now };
        }
        return { category_id: null, classified_by: null, classified_at: null };
      })(),
      upload_id: up.id,
      // 원본 행 역참조 — 로우데이터 페이지에서 "이 건은 명세 몇 번째 줄"을 되짚는다
      raw_row_id: t.rawRowIndex != null ? (rawSaved?.rowIdByIndex.get(t.rawRowIndex) ?? null) : null,
    }));

    const { error: insErr } = await supabase.schema('finance').from('transactions').insert(rows);
    if (insErr) {
      // 보정: 방금 만든 업로드 기록 제거(고아 방지)
      await supabase.schema('finance').from('uploads').delete().eq('id', up.id);
      return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });
    }
    // 원본 배치를 이번 업로드 기록에 연결(배치 메타는 수정 가능 — append-only 는 raw_rows 만)
    if (rawSaved) {
      await supabase.schema('finance').from('raw_batches').update({ upload_id: up.id }).eq('id', rawSaved.batchId);
    }
  }

  // 2) 카드 건이 안전히 들어간 뒤에야 은행 카드결제 lump을 잠근다(카드대금정산).
  //    잠금 실패 시 방금 편입한 카드 건을 되돌려, lump만 빠지거나 이중계상되는 상태를 막는다.
  let linked = false;
  if (settledTxId && settleCatId != null) {
    const now = new Date().toISOString();
    const { error: lockErr } = await supabase
      .schema('finance')
      .from('transactions')
      .update({ category_id: settleCatId, classified_by: user.id, classified_at: now })
      .eq('id', settledTxId)
      .eq('source', 'bank');
    if (lockErr) {
      if (uploadId != null) {
        await supabase.schema('finance').from('transactions').delete().eq('upload_id', uploadId);
        await supabase.schema('finance').from('uploads').delete().eq('id', uploadId);
      }
      return NextResponse.json({ error: `정산 연결 실패: ${lockErr.message}` }, { status: 500 });
    }
    linked = true;
  }

  await logActivity(
    supabase,
    user,
    '카드 내역 저장',
    `[${brand}] ${fresh.length}건(중복 ${duplicates}${substClassifiedTotal > 0 ? ` · 대체 자동분류 ${substClassifiedTotal}` : ''}${blockedConfirmed > 0 ? ` · 확정월 보류 ${blockedConfirmed}` : ''})`
  );
  return NextResponse.json({
    saved: fresh.length,
    duplicates,
    autoClassified: substClassifiedTotal,
    substClassified: substClassifiedTotal,
    blockedConfirmed,
    originalArchived,
    linked,
  });
}
