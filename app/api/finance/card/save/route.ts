import { NextResponse } from 'next/server';
import { parseCardXlsx } from '@/lib/finance/card';
import { dedupe } from '@/lib/finance/parse';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { fetchExistingHashes } from '@/lib/finance/dedup';
import { archiveOriginal } from '@/lib/finance/original-archive';
import { fetchStoreRuleMap } from '@/lib/finance/storeRules';

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

  // 원본 보관 — 재파싱 대비
  const cardDates = result.transactions.map((t) => t.txAt).sort();
  await archiveOriginal(supabase, user, file, {
    area: `card-${brand}`,
    ym: cardDates[0]?.slice(0, 7),
    brand,
    note: '신한카드',
  });

  // 신규만
  const allHashes = result.transactions.map((t) => t.dedupHash);
  const existing = await fetchExistingHashes(supabase, allHashes);
  const { fresh, duplicates } = dedupe(result.transactions, existing);

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
      category_id: null, // 카드는 자동 확정 안 함 — 지출 자료 분류에서 직접 선택
      classified_by: null,
      classified_at: null,
      upload_id: up.id,
    }));

    const { error: insErr } = await supabase.schema('finance').from('transactions').insert(rows);
    if (insErr) {
      // 보정: 방금 만든 업로드 기록 제거(고아 방지)
      await supabase.schema('finance').from('uploads').delete().eq('id', up.id);
      return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });
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

  await logActivity(supabase, user, '카드 내역 저장', `[${brand}] ${fresh.length}건(중복 ${duplicates})`);
  return NextResponse.json({ saved: fresh.length, duplicates, autoClassified: 0, linked });
}
