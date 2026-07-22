import { NextResponse } from 'next/server';
import { pdfToLayoutText } from '@/lib/finance/pdf';
import { parseStatement, dedupe } from '@/lib/finance/parse';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import type { BankSource } from '@/lib/finance/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 저장: 파싱 → DB 지문 대조 dedup → 학습규칙 자동분류 → transactions insert + upload 기록
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
  const bank = form.get('bank') as BankSource | null;
  const password = (form.get('password') as string) || undefined;
  if (!(file instanceof File) || (bank !== 'shinhan' && bank !== 'woori')) {
    return NextResponse.json({ error: '파일과 은행을 선택하세요.' }, { status: 400 });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = await pdfToLayoutText(data, password);
  } catch (e) {
    return NextResponse.json({ error: `PDF를 열지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }

  const result = parseStatement(bank, text);
  if (result.totalRows === 0) {
    return NextResponse.json({ error: '거래를 읽지 못했습니다.' }, { status: 422 });
  }

  // DB 지문 대조 → 신규만
  const allHashes = result.transactions.map((t) => t.dedupHash);
  const existing = await fetchExistingHashes(supabase, allHashes);
  const { fresh } = dedupe(result.transactions, existing);
  const duplicates = result.totalRows - fresh.length;
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
      .eq('brand', 'garden') // 은행 거래는 garden 고정(migration_brand) — 규칙도 garden 것만
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
      bank,
      row_count: fresh.length,
      uploaded_by: user.id,
      period_start: dates[0]?.slice(0, 10),
      period_end: dates[dates.length - 1]?.slice(0, 10),
    })
    .select('id')
    .single();
  if (upErr || !up) {
    return NextResponse.json({ error: `업로드 기록 실패: ${upErr?.message ?? ''}` }, { status: 500 });
  }

  const now = new Date().toISOString();
  const rows = fresh.map((t) => {
    const cat = keyToCat.get(t.normalizedKey) ?? null;
    return {
      bank: t.bank,
      tx_at: t.txAt,
      ym: t.ym,
      channel: t.channel,
      memo: t.memo,
      amount_out: t.amountOut,
      amount_in: t.amountIn,
      balance: t.balance,
      branch: t.branch,
      dedup_hash: t.dedupHash,
      normalized_key: t.normalizedKey,
      category_id: cat,
      classified_by: cat ? user.id : null,
      classified_at: cat ? now : null,
      upload_id: up.id,
    };
  });

  const { error: insErr } = await supabase.schema('finance').from('transactions').insert(rows);
  if (insErr) {
    // 보정: 거래 저장 실패 시 방금 만든 업로드 기록 제거(0건짜리 고아 방지)
    await supabase.schema('finance').from('uploads').delete().eq('id', up.id);
    return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });
  }

  await logActivity(supabase, user, '은행 내역 저장', `${bank} ${fresh.length}건(중복 ${duplicates})`);

  return NextResponse.json({
    saved: fresh.length,
    duplicates,
    autoClassified: rows.filter((r) => r.category_id).length,
  });
}
