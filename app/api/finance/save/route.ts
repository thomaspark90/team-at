import { NextResponse } from 'next/server';
import { pdfToLayoutText } from '@/lib/finance/pdf';
import { parseStatement, dedupe } from '@/lib/finance/parse';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { lockedYms } from '@/lib/finance/monthLock';
import type { BankSource, Brand } from '@/lib/finance/types';
import { archiveOriginal } from '@/lib/finance/original-archive';
import { fetchStoreRuleMap } from '@/lib/finance/storeRules';

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
  // 계좌가 브랜드별로 분리 — 브랜드별 업로드 페이지가 자기 브랜드를 명시한다(미지정=garden, 기존 동작 유지)
  const rawBrand = String(form.get('brand') ?? 'garden');
  if (rawBrand !== 'garden' && rawBrand !== 'staffmeal') {
    return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  }
  const brand: Brand = rawBrand;

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

  // 원본 보관 — 재파싱 대비
  const bankDates = result.transactions.map((t) => t.txAt).sort();
  await archiveOriginal(supabase, user, file, {
    area: `bank-pdf-${brand}-${bank}`,
    ym: bankDates[0]?.slice(0, 7),
    brand,
    note: bank,
  });

  // DB 지문 대조 → 신규만
  const allHashes = result.transactions.map((t) => t.dedupHash);
  const existing = await fetchExistingHashes(supabase, allHashes);
  const { fresh: freshAll } = dedupe(result.transactions, existing);
  const duplicates = result.totalRows - freshAll.length;

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
    return NextResponse.json({ saved: 0, duplicates, autoClassified: 0, blockedConfirmed: 0 });
  }

  // 학습 규칙(normalized_key → category_id)으로 자동 분류
  const keys = Array.from(new Set(fresh.map((t) => t.normalizedKey)));
  const keyToCat = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data: rules } = await supabase
      .schema('finance')
      .from('rules')
      .select('normalized_key,category_id')
      .eq('brand', brand) // 규칙은 업로드 브랜드 것만 — 브랜드 경계 밖 학습 오염 방지
      .in('normalized_key', keys.slice(i, i + 100));
    (rules ?? []).forEach((r: { normalized_key: string; category_id: number }) =>
      keyToCat.set(r.normalized_key, r.category_id)
    );
  }
  // 학습된 지점 규칙(가든 공용 계좌라 은행 업로드는 지점을 모름 — 가맹점명으로 채워본다, 2026-08-17)
  const keyToStore = brand === 'garden' ? await fetchStoreRuleMap(supabase, keys) : new Map();

  // 업로드 기록
  const dates = fresh.map((t) => t.txAt).sort();
  const { data: up, error: upErr } = await supabase
    .schema('finance')
    .from('uploads')
    .insert({
      bank,
      brand,
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
      brand,
      store: keyToStore.get(t.normalizedKey) ?? null,
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

  await logActivity(supabase, user, '은행 내역 저장', `[${brand}] ${bank} ${fresh.length}건(중복 ${duplicates})`);

  return NextResponse.json({
    saved: fresh.length,
    duplicates,
    autoClassified: rows.filter((r) => r.category_id).length,
    blockedConfirmed, // 확정월이라 제외된 건수
  });
}
