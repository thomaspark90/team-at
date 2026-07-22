import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { dedupe } from '@/lib/finance/parse';
import { fileToRows, rowsToTransactions, type ExcelMapping } from '@/lib/finance/excel';
import { SLOT_KEYS, UPLOAD_SLOTS } from '@/lib/finance/uploadSlots';

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
  // 월별 보드에서 올릴 때 어느 월·슬롯 몫인지(선택) — 보드 완료 체크에 사용
  const slotRaw = form.get('slot');
  const ymRaw = form.get('ym');
  const slot = typeof slotRaw === 'string' && SLOT_KEYS.includes(slotRaw) ? slotRaw : null;
  const slotYm = typeof ymRaw === 'string' && /^\d{4}-\d{2}$/.test(ymRaw) ? ymRaw : null;
  // 슬롯별 거래 출처 — 카드·쿠팡은 'card'(현금 집계 제외), 네이버는 'naverpay', 그 외 'bank'
  const source = UPLOAD_SLOTS.find((s) => s.key === slot)?.source ?? 'bank';
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
  try {
    const rows = fileToRows(new Uint8Array(await file.arrayBuffer()));
    result = rowsToTransactions(rows, mapping);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
  if (result.totalRows === 0) {
    return NextResponse.json({ error: '거래를 읽지 못했어요.' }, { status: 422 });
  }

  const existing = await fetchExistingHashes(
    supabase,
    result.transactions.map((t) => t.dedupHash)
  );
  // 기간은 신규가 아닌 '파일 전체' 기준 — 커버리지(부분 업로드) 판정이 정확해야 해서.
  const allDates = result.transactions.map((t) => t.txAt).sort();
  const periodStart = allDates[0]?.slice(0, 10);
  const periodEnd = allDates[allDates.length - 1]?.slice(0, 10);

  const { fresh, duplicates } = dedupe(result.transactions, existing);
  if (fresh.length === 0) {
    // 전부 중복이어도 보드 슬롯은 '올렸음'으로 기록해 완료·커버리지 체크가 남게 한다
    if (slot && slotYm) {
      await supabase.schema('finance').from('uploads').insert({
        bank: 'excel',
        source,
        row_count: 0,
        uploaded_by: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        slot,
        slot_ym: slotYm,
      });
    }
    return NextResponse.json({ saved: 0, duplicates, autoClassified: 0 });
  }

  // 학습 규칙(normalized_key → category_id)으로 자동 분류
  const keys = Array.from(new Set(fresh.map((t) => t.normalizedKey)));
  const keyToCat = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data: rules } = await supabase
      .schema('finance')
      .from('rules')
      .select('normalized_key,category_id')
      .eq('brand', 'garden') // 카드·엑셀 거래는 garden 고정(migration_brand) — 규칙도 garden 것만
      .in('normalized_key', keys.slice(i, i + 100));
    (rules ?? []).forEach((r: { normalized_key: string; category_id: number }) =>
      keyToCat.set(r.normalized_key, r.category_id)
    );
  }

  // 업로드 기록
  const { data: up, error: upErr } = await supabase
    .schema('finance')
    .from('uploads')
    .insert({
      bank: 'excel',
      source,
      row_count: fresh.length,
      uploaded_by: user.id,
      period_start: periodStart,
      period_end: periodEnd,
      ...(slot && slotYm ? { slot, slot_ym: slotYm } : {}),
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

  const now = new Date().toISOString();
  const insertRows = fresh.map((t) => {
    const cat = keyToCat.get(t.normalizedKey) ?? null;
    return {
      bank: 'excel',
      source,
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
    `${slotLabel ? `[${slotYm} ${slotLabel}] ` : ''}${file.name} ${fresh.length}건(중복 ${duplicates})`
  );

  return NextResponse.json({
    saved: fresh.length,
    duplicates,
    autoClassified: insertRows.filter((r) => r.category_id).length,
  });
}
