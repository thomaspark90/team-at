import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { hash } from '@/lib/finance/dedup';
import { anyInvolvedUnitConfirmed } from '@/lib/finance/monthLock';

export const runtime = 'nodejs';

// 건별 분할 — 한 지점 매입으로 잡힌 공동구매(수세미·시럽 대량주문 등)를 브랜드·지점별로 쪼갠다.
// 패턴은 영수증분해와 동일: 원본을 excluded›건별분할로 잠그고(손익 제외), 자식 행들이 손익에 잡힌다.
// POST   { txId, allocations: [{brand, store, amount}], learnRule? } → 분할 실행 (+비율 규칙 학습)
// DELETE { txId } → 분할 해제 (자식 삭제, 원본 미분류 복원)

interface Allocation {
  brand: 'staffmeal' | 'garden';
  store: 'pangyo' | 'yangjae' | null;
  amount: number;
}

const SPLIT_CAT_HINT = "'건별분할' 계정과목이 없습니다. supabase/migration_accounting_split.sql 을 먼저 실행하세요.";

async function splitCatId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number | null> {
  const { data } = await supabase
    .schema('finance')
    .from('categories')
    .select('id')
    .eq('type', 'excluded')
    .eq('name', '건별분할')
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '분류 권한이 없습니다.' }, { status: 403 });
  }

  let body: { txId?: number; allocations?: Allocation[]; learnRule?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
  }
  const txId = Number(body.txId);
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  if (!txId || allocations.length < 2) {
    return NextResponse.json({ error: '분할할 거래와 2개 이상의 배분이 필요합니다.' }, { status: 400 });
  }
  for (const a of allocations) {
    if (a.brand !== 'staffmeal' && a.brand !== 'garden') {
      return NextResponse.json({ error: '배분 브랜드가 올바르지 않습니다.' }, { status: 400 });
    }
    if (a.store != null && a.store !== 'pangyo' && a.store !== 'yangjae') {
      return NextResponse.json({ error: '배분 지점이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!Number.isFinite(a.amount) || Math.round(a.amount) <= 0) {
      return NextResponse.json({ error: '배분 금액은 0보다 커야 합니다.' }, { status: 400 });
    }
  }

  const catId = await splitCatId(supabase);
  if (catId == null) return NextResponse.json({ error: SPLIT_CAT_HINT }, { status: 400 });

  const { data: parent } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,bank,source,card_issuer,is_installment,tx_at,ym,channel,memo,amount_out,amount_in,brand,store,branch,normalized_key,category_id,split_parent_id')
    .eq('id', txId)
    .maybeSingle();
  if (!parent) return NextResponse.json({ error: '거래를 찾을 수 없습니다.' }, { status: 404 });
  if (parent.split_parent_id != null) {
    return NextResponse.json({ error: '분할로 생긴 행은 다시 분할할 수 없습니다.' }, { status: 400 });
  }
  if (parent.category_id === catId) {
    return NextResponse.json({ error: '이미 분할된 거래입니다. 먼저 분할을 해제하세요.' }, { status: 400 });
  }

  const isOut = Number(parent.amount_out) > 0;
  const total = isOut ? Number(parent.amount_out) : Number(parent.amount_in);
  const sum = allocations.reduce((s, a) => s + Math.round(a.amount), 0);
  if (sum !== total) {
    return NextResponse.json(
      { error: `배분 합계(${sum.toLocaleString()})가 거래 금액(${total.toLocaleString()})과 일치해야 합니다.` },
      { status: 400 },
    );
  }

  // 확정된 달 보호 — 확정은 3단위(ym, brand, store). 원거래·배분 대상이 걸친 단위 중
  // 하나라도 확정이면 불가(판정은 monthLock.anyInvolvedUnitConfirmed 단일 소스, 2026-08-21 C4).
  const involved: { brand: string; store: string | null }[] = [
    { brand: parent.brand, store: parent.store ?? null },
    ...allocations.map((a) => ({ brand: a.brand as string, store: (a.store ?? null) as string | null })),
  ];
  if (await anyInvolvedUnitConfirmed(supabase, parent.ym, involved)) {
    return NextResponse.json({ error: `확정된 달(${parent.ym})의 거래는 분할할 수 없습니다.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const children = allocations.map((a, idx) => ({
    bank: parent.bank,
    source: parent.source,
    card_issuer: parent.card_issuer,
    is_installment: parent.is_installment,
    tx_at: parent.tx_at,
    ym: parent.ym,
    channel: parent.channel,
    memo: parent.memo,
    amount_out: isOut ? Math.round(a.amount) : 0,
    amount_in: isOut ? 0 : Math.round(a.amount),
    balance: 0,
    branch: parent.branch,
    brand: a.brand,
    store: a.store,
    split_parent_id: parent.id,
    // 배분 순번(idx) 포함 — 같은 (브랜드,지점,금액) 배분 2건이 지문 충돌로 UNIQUE 위반
    // 저장 실패가 나던 문제(2026-08-21 감사 A8). 해제 시 자식이 전부 삭제되므로 재분할에도 안전.
    dedup_hash: hash('split', parent.id, idx, a.brand, a.store ?? '', Math.round(a.amount)),
    normalized_key: parent.normalized_key,
    // 원거래에 계정이 있었으면 그대로 상속 — 분할해도 분류를 다시 할 필요 없음
    category_id: parent.category_id,
    classified_by: parent.category_id != null ? user.id : null,
    classified_at: parent.category_id != null ? now : null,
  }));

  // 1) 자식 먼저 저장 — 실패 시 원본을 잠그지 않아 금액 유실 없음
  const { error: insErr } = await supabase.schema('finance').from('transactions').insert(children);
  if (insErr) return NextResponse.json({ error: `분할 저장 실패: ${insErr.message}` }, { status: 500 });

  // 2) 원본을 건별분할로 잠금 — 실패 시 자식 되돌림
  const { error: lockErr } = await supabase
    .schema('finance')
    .from('transactions')
    .update({ category_id: catId, classified_by: user.id, classified_at: now })
    .eq('id', parent.id);
  if (lockErr) {
    await supabase.schema('finance').from('transactions').delete().eq('split_parent_id', parent.id);
    return NextResponse.json({ error: `원본 잠금 실패: ${lockErr.message}` }, { status: 500 });
  }

  // 3) (선택) 비율 규칙 학습 — 같은 가맹점은 다음부터 자동 제안
  if (body.learnRule !== false && parent.normalized_key) {
    const ratios = allocations.map((a) => ({
      brand: a.brand,
      store: a.store,
      ratio: Math.round(a.amount) / total,
    }));
    await supabase
      .schema('finance')
      .from('split_rules')
      .upsert(
        { normalized_key: parent.normalized_key, brand: parent.brand, allocations: ratios, created_by: user.id },
        { onConflict: 'normalized_key,brand' },
      );
  }

  await logActivity(supabase, user, '건별 분할', `#${parent.id} ${parent.memo} → ${allocations.length}건`);
  return NextResponse.json({ ok: true, children: children.length });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '분류 권한이 없습니다.' }, { status: 403 });
  }

  let body: { txId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
  }
  const txId = Number(body.txId);
  if (!txId) return NextResponse.json({ error: '거래 id가 필요합니다.' }, { status: 400 });

  const catId = await splitCatId(supabase);
  if (catId == null) return NextResponse.json({ error: SPLIT_CAT_HINT }, { status: 400 });

  const { data: parent } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,ym,memo,category_id')
    .eq('id', txId)
    .maybeSingle();
  if (!parent || parent.category_id !== catId) {
    return NextResponse.json({ error: '분할된 거래가 아닙니다.' }, { status: 400 });
  }

  // 자식이 걸친 단위 포함 확정 보호 — 확정은 3단위(ym, brand, store).
  // 판정은 monthLock.anyInvolvedUnitConfirmed 단일 소스(2026-08-21 C4).
  const { data: kids } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,brand,store')
    .eq('split_parent_id', txId);
  const kidUnits = ((kids ?? []) as { brand: string; store?: string | null }[]).map((k) => ({
    brand: k.brand,
    store: k.store ?? null,
  }));
  if (await anyInvolvedUnitConfirmed(supabase, parent.ym, kidUnits)) {
    return NextResponse.json({ error: `확정된 달(${parent.ym})이 걸려 있어 해제할 수 없습니다.` }, { status: 409 });
  }

  const { error: delErr } = await supabase.schema('finance').from('transactions').delete().eq('split_parent_id', txId);
  if (delErr) return NextResponse.json({ error: `분할 행 삭제 실패: ${delErr.message}` }, { status: 500 });

  // 원본은 미분류로 복원(분할 전 계정은 기록하지 않음 — 다시 분류)
  const { error: restoreErr } = await supabase
    .schema('finance')
    .from('transactions')
    .update({ category_id: null, classified_by: null, classified_at: null })
    .eq('id', txId);
  if (restoreErr) return NextResponse.json({ error: `원본 복원 실패: ${restoreErr.message}` }, { status: 500 });

  await logActivity(supabase, user, '건별 분할 해제', `#${parent.id} ${parent.memo}`);
  return NextResponse.json({ ok: true, removed: kids?.length ?? 0 });
}
