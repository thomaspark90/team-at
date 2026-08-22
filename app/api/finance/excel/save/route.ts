import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { lockedYms } from '@/lib/finance/monthLock';
import { dedupe } from '@/lib/finance/parse';
import { fileToRows, rowsToTransactions, type ExcelMapping } from '@/lib/finance/excel';
import { SLOT_KEYS, UPLOAD_SLOTS } from '@/lib/finance/uploadSlots';
import { archiveOriginal } from '@/lib/finance/original-archive';
import { fetchStoreRuleMap } from '@/lib/finance/storeRules';
import { buildRawRows, saveRawBatchSafe } from '@/lib/finance/raw';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 저장: 미리보기에서 받은 매핑으로 변환 → dedup → 학습규칙 자동분류 → transactions insert + upload 기록.
// (은행 PDF save 라우트와 같은 절차 — 소스만 'excel')
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
  const mappingRaw = form.get('mapping');
  // 어느 슬롯 몫인지(선택) — 보드 완료 체크에 사용. 월별 보드는 slot+ym을,
  // 업로드 페이지(전체 기간 엑셀)는 slot만 보낸다 — 완료 체크는 기간 겹침으로 잡힌다.
  const slotRaw = form.get('slot');
  const ymRaw = form.get('ym');
  const slot = typeof slotRaw === 'string' && SLOT_KEYS.includes(slotRaw) ? slotRaw : null;
  const slotYm = typeof ymRaw === 'string' && /^\d{4}-\d{2}$/.test(ymRaw) ? ymRaw : null;
  // 브랜드별 업로드 보드가 자기 브랜드를 명시(미지정=garden, 기존 동작 유지)
  const brand = String(form.get('brand') ?? 'garden');
  if (brand !== 'garden' && brand !== 'staffmeal') {
    return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  }
  // 슬롯별 거래 출처 — 카드·쿠팡은 'card'(현금 집계 제외), 네이버는 'naverpay', 그 외 'bank'
  const source = UPLOAD_SLOTS.find((s) => s.key === slot)?.source ?? 'bank';
  // 은행 슬롯 엑셀은 실제 은행으로 기록 — 분류 화면의 은행 필터·표시 라벨이 제대로 잡히게.
  // (중복 지문은 파싱 때 'excel' 프리픽스로 이미 확정돼 재업로드 dedup에는 영향 없음)
  const bankLabel = slot === 'bank_shinhan' ? 'shinhan' : slot === 'bank_woori' ? 'woori' : 'excel';
  if (!(file instanceof File) || typeof mappingRaw !== 'string') {
    return NextResponse.json({ error: '파일과 매핑 정보가 필요해요. 미리보기부터 다시 해주세요.' }, { status: 400 });
  }
  let mapping: ExcelMapping;
  try {
    mapping = JSON.parse(mappingRaw) as ExcelMapping;
  } catch {
    return NextResponse.json({ error: '매핑 정보 형식이 잘못됐어요.' }, { status: 400 });
  }

  let result;
  let sheetRows: string[][] = [];
  try {
    sheetRows = fileToRows(new Uint8Array(await file.arrayBuffer()));
    // 지문 v2 — 브랜드·은행·동일튜플 순번 포함(2026-08-21 D9, rowsToTransactions 주석 참조)
    result = rowsToTransactions(sheetRows, mapping, { brand, bank: bankLabel });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
  if (result.totalRows === 0) {
    return NextResponse.json({ error: '거래를 읽지 못했어요.' }, { status: 422 });
  }

  // 새 지문·구지문을 모두 대조 — 옛 지문으로 적재된 과거 거래가 신규로 오인되지 않게(D9)
  const existing = await fetchExistingHashes(
    supabase,
    result.transactions.flatMap((t) => (t.legacyDedupHash ? [t.dedupHash, t.legacyDedupHash] : [t.dedupHash]))
  );
  // 기간은 신규가 아닌 '파일 전체' 기준 — 커버리지(부분 업로드) 판정이 정확해야 해서.
  const allDates = result.transactions.map((t) => t.txAt).sort();
  const periodStart = allDates[0]?.slice(0, 10);
  const periodEnd = allDates[allDates.length - 1]?.slice(0, 10);

  // 원본 보관 — 재파싱 대비. 슬롯(은행 등)별로 구분해 area 를 나눈다.
  const originalArchived = await archiveOriginal(supabase, user, file, {
    area: `bank-excel-${brand}${slot ? `-${slot}` : ''}`,
    ym: slotYm ?? periodStart?.slice(0, 7),
    brand,
    note: bankLabel,
  });

  // 로우데이터 적재 — dedup 앞에서 한다. 이미 올린 파일을 다시 올리는 경우(raw 도입 전 자료의
  // 소급 보관)에도 원본이 남아야 하기 때문. 실패해도 본 저장은 계속한다.
  const dateByRow = new Map<number, string>();
  for (const t of result.transactions) if (t.rawRowIndex != null) dateByRow.set(t.rawRowIndex, t.txAt.slice(0, 10));
  const rawSaved = await saveRawBatchSafe(
    supabase,
    {
      source: 'bank',
      issuer: bankLabel,
      brand,
      filename: file.name,
      header: mapping.header_row != null ? (sheetRows[mapping.header_row] ?? null) : null,
      periodStart,
      periodEnd,
      userId: user.id,
    },
    buildRawRows(sheetRows).map((r) => ({ ...r, rowDate: dateByRow.get(r.rowIndex) ?? null }))
  );

  const { fresh: freshAll, duplicates } = dedupe(result.transactions, existing);

  // 중복 건도 원본에 이어 붙인다 — raw 도입 전에 적재된 거래는 raw_row_id 가 비어 있는데,
  // 같은 파일을 다시 올리면 '전부 중복'이라 새 거래가 안 생겨 영영 연결될 기회가 없다.
  // 그래서 중복으로 걸러진 건의 dedup_hash 로 기존 행을 찾아 원본 행을 채워준다(소급 연결).
  if (rawSaved) {
    // 기존 행의 지문은 새(v2)일 수도, 구(v1)일 수도 있다 — 실제로 매칭된 쪽으로 연결한다(D9)
    const dupLinks = result.transactions
      .filter((t) => (existing.has(t.dedupHash) || (t.legacyDedupHash != null && existing.has(t.legacyDedupHash))) && t.rawRowIndex != null)
      .map((t) => ({
        hash: existing.has(t.dedupHash) ? t.dedupHash : t.legacyDedupHash!,
        rawId: rawSaved.rowIdByIndex.get(t.rawRowIndex!),
      }))
      .filter((d): d is { hash: string; rawId: number } => d.rawId != null);
    if (dupLinks.length > 0) {
      // 행마다 왕복하면 수천 건에서 타임아웃 — 한 번의 UPDATE 로 처리한다
      const { error: linkErr } = await supabase.schema('finance').rpc('link_raw_rows', {
        p_hashes: dupLinks.map((d) => d.hash),
        p_raw_ids: dupLinks.map((d) => d.rawId),
      });
      if (linkErr) console.error('[raw] 중복분 원본 연결 실패:', linkErr.message);
    }
  }

  // 확정월 가드 — 확정된 달의 거래는 저장하지 않는다(POS·분할과 동일한 409 규칙,
  // 여러 달 파일은 확정월 몫만 제외하고 나머지는 저장).
  const locked = await lockedYms(supabase, brand);
  const blockedMonths = Array.from(new Set(freshAll.filter((t) => locked.has(t.ym)).map((t) => t.ym))).sort();
  const fresh = freshAll.filter((t) => !locked.has(t.ym));
  const blockedConfirmed = freshAll.length - fresh.length;
  if (fresh.length === 0 && blockedConfirmed > 0) {
    return NextResponse.json(
      { error: `확정된 달(${blockedMonths.join(', ')})의 거래만 있어요. 월 확정을 재오픈한 뒤 올려주세요.` },
      { status: 409 }
    );
  }
  if (fresh.length === 0) {
    // 전부 중복이어도 보드 슬롯은 '올렸음'으로 기록해 완료·커버리지 체크가 남게 한다
    if (slot) {
      await supabase.schema('finance').from('uploads').insert({
        bank: bankLabel,
        source,
        brand,
        row_count: 0,
        uploaded_by: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        slot,
        slot_ym: slotYm,
      });
    }
    return NextResponse.json({ saved: 0, duplicates, autoClassified: 0, blockedConfirmed: 0, originalArchived });
  }

  // 학습 규칙(normalized_key → category_id)으로 자동 분류
  const keys = Array.from(new Set(fresh.map((t) => t.normalizedKey)));
  const keyToCat = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data: rules } = await supabase
      .schema('finance')
      .from('rules')
      .select('normalized_key,category_id')
      .eq('brand', brand) // 규칙은 업로드 브랜드 것만
      .in('normalized_key', keys.slice(i, i + 100));
    (rules ?? []).forEach((r: { normalized_key: string; category_id: number }) =>
      keyToCat.set(r.normalized_key, r.category_id)
    );
  }
  // 학습된 지점 규칙(가든 공용 계좌·카드라 지점을 모름 — 가맹점명으로 채워본다, 2026-08-17)
  const keyToStore = brand === 'garden' ? await fetchStoreRuleMap(supabase, keys) : new Map();

  // 업로드 기록
  const { data: up, error: upErr } = await supabase
    .schema('finance')
    .from('uploads')
    .insert({
      bank: bankLabel,
      source,
      brand,
      row_count: fresh.length,
      uploaded_by: user.id,
      period_start: periodStart,
      period_end: periodEnd,
      ...(slot ? { slot, slot_ym: slotYm } : {}),
    })
    .select('id')
    .single();
  if (upErr || !up) {
    const msg = upErr?.message ?? '';
    const friendly = /invalid input value.*bank_source/i.test(msg)
      ? "bank_source 에 'excel' 이 아직 없어요. 관리자가 supabase/migration_excel_source.sql 을 실행해야 해요."
      : /slot/.test(msg)
        ? '업로드 보드 컬럼이 아직 없어요. 관리자가 supabase/migration_upload_slots.sql 을 실행해야 해요.'
        : `업로드 기록 실패: ${msg}`;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }

  // 원본 배치를 이번 업로드 기록에 연결(배치 메타는 수정 가능 — append-only 는 raw_rows 만)
  if (rawSaved) {
    await supabase.schema('finance').from('raw_batches').update({ upload_id: up.id }).eq('id', rawSaved.batchId);
  }

  const now = new Date().toISOString();
  const insertRows = fresh.map((t) => {
    const cat = keyToCat.get(t.normalizedKey) ?? null;
    return {
      bank: bankLabel,
      source,
      brand,
      store: keyToStore.get(t.normalizedKey) ?? null,
      tx_at: t.txAt,
      ym: t.ym,
      channel: t.channel,
      memo: t.memo,
      amount_out: t.amountOut,
      amount_in: t.amountIn,
      balance: t.balance,
      branch: null,
      dedup_hash: t.dedupHash,
      normalized_key: t.normalizedKey,
      category_id: cat,
      classified_by: cat ? user.id : null,
      classified_at: cat ? now : null,
      upload_id: up.id,
      // 원본 행 역참조 — 로우데이터 페이지에서 "이 거래는 파일 몇 번째 줄" 을 되짚는다
      raw_row_id: t.rawRowIndex != null ? (rawSaved?.rowIdByIndex.get(t.rawRowIndex) ?? null) : null,
    };
  });

  const { error: insErr } = await supabase.schema('finance').from('transactions').insert(insertRows);
  if (insErr) {
    await supabase.schema('finance').from('uploads').delete().eq('id', up.id);
    return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });
  }

  const slotLabel = slot ? UPLOAD_SLOTS.find((s) => s.key === slot)?.label : null;
  await logActivity(
    supabase,
    user,
    '엑셀 내역 저장',
    `[${brand}] ${slotLabel ? `[${slotYm ? `${slotYm} ` : ''}${slotLabel}] ` : ''}${file.name} ${fresh.length}건(중복 ${duplicates})`
  );

  return NextResponse.json({
    saved: fresh.length,
    duplicates,
    autoClassified: insertRows.filter((r) => r.category_id).length,
    blockedConfirmed, // 확정월이라 제외된 건수
    originalArchived,
  });
}
