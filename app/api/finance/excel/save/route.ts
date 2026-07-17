import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { dedupe } from '@/lib/finance/parse';
import { fileToRows, rowsToTransactions, type ExcelMapping } from '@/lib/finance/excel';

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
  const { fresh, duplicates } = dedupe(result.transactions, existing);
  if (fresh.length === 0) {
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
      .in('normalized_key', keys.slice(i, i + 100));
    (rules ?? []).forEach((r: { normalized_key: string; category_id: number }) =>
      keyToCat.set(r.normalized_key, r.category_id)
    );
  }

  // 업로드 기록
  const dates = fresh.map((t) => t.txAt).sort();
  const { data: up, error: upErr } = await supabase
    .schema('finance')
    .from('uploads')
    .insert({
      bank: 'excel',
      row_count: fresh.length,
      uploaded_by: user.id,
      period_start: dates[0]?.slice(0, 10),
      period_end: dates[dates.length - 1]?.slice(0, 10),
    })
    .select('id')
    .single();
  if (upErr || !up) {
    const msg = upErr?.message ?? '';
    return NextResponse.json(
      {
        error: /invalid input value.*bank_source/i.test(msg)
          ? "bank_source 에 'excel' 이 아직 없어요. 관리자가 supabase/migration_excel_source.sql 을 실행해야 해요."
          : `업로드 기록 실패: ${msg}`,
      },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  const insertRows = fresh.map((t) => {
    const cat = keyToCat.get(t.normalizedKey) ?? null;
    return {
      bank: 'excel',
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

  await logActivity(supabase, user, '엑셀 내역 저장', `${file.name} ${fresh.length}건(중복 ${duplicates})`);

  return NextResponse.json({
    saved: fresh.length,
    duplicates,
    autoClassified: insertRows.filter((r) => r.category_id).length,
  });
}
