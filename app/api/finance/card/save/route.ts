import { NextResponse } from 'next/server';
import { parseCardXlsx } from '@/lib/finance/card';
import { dedupe } from '@/lib/finance/parse';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

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

  let result;
  try {
    result = parseCardXlsx(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: `엑셀을 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (result.totalRows === 0) {
    return NextResponse.json({ error: '이용내역을 읽지 못했습니다.' }, { status: 422 });
  }

  // 신규만
  const allHashes = result.transactions.map((t) => t.dedupHash);
  const existing = new Set<string>();
  for (let i = 0; i < allHashes.length; i += 100) {
    const { data } = await supabase
      .schema('finance')
      .from('transactions')
      .select('dedup_hash')
      .in('dedup_hash', allHashes.slice(i, i + 100));
    (data ?? []).forEach((e: { dedup_hash: string }) => existing.add(e.dedup_hash));
  }
  const { fresh, duplicates } = dedupe(result.transactions, existing);

  const net = result.sumOut - result.sumIn;

  // 은행 카드결제 건 잠금(카드대금정산). 링크가 있을 때만.
  let linked = false;
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
    const now = new Date().toISOString();
    const { error: lockErr } = await supabase
      .schema('finance')
      .from('transactions')
      .update({ category_id: cat.id, classified_by: user.id, classified_at: now })
      .eq('id', settledTxId)
      .eq('source', 'bank');
    if (lockErr) return NextResponse.json({ error: `정산 연결 실패: ${lockErr.message}` }, { status: 500 });
    linked = true;
  }

  if (fresh.length === 0) {
    return NextResponse.json({ saved: 0, duplicates, autoClassified: 0, linked });
  }

  // 카드 건은 자동 확정하지 않음 — 전부 미분류로 저장하고 거래 분류에서 직접 선택.
  // (학습된 가맹점은 거래 분류 화면에서 '추천'으로 미리 선택돼 보임)

  // 업로드 기록(카드 배치)
  const dates = fresh.map((t) => t.txAt).sort();
  const { data: up, error: upErr } = await supabase
    .schema('finance')
    .from('uploads')
    .insert({
      bank: 'shinhan',
      source: 'card',
      card_issuer: '신한',
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

  const rows = fresh.map((t) => ({
    bank: 'shinhan',
    source: 'card',
    card_issuer: '신한',
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
    category_id: null, // 카드는 자동 확정 안 함 — 거래 분류에서 직접 선택
    classified_by: null,
    classified_at: null,
    upload_id: up.id,
  }));

  const { error: insErr } = await supabase.schema('finance').from('transactions').insert(rows);
  if (insErr) return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });

  return NextResponse.json({ saved: fresh.length, duplicates, autoClassified: 0, linked });
}
