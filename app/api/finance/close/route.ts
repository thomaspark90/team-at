import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { canConfirm } from '@/lib/finance/access';
import { unitOf } from '@/lib/finance/types';
import { computeMonthlyFigures, type SnapshotFigures } from '@/lib/finance/closeSnapshot';
import { countUnassignedGarden } from '@/lib/finance/unassignedStore';

export const runtime = 'nodejs';

// 월 확정 / 재오픈. 서버에서 미분류 0건을 강제(클라이언트 신뢰 안 함).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const allowed = await canConfirm(supabase, user);
  if (!allowed) return NextResponse.json({ error: '월 확정 권한이 없습니다.' }, { status: 403 });

  let body: { ym?: string; action?: string; unit?: string; brand?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const ym = body.ym;
  const action = body.action;
  // 확정은 3단위 — 스탭밀 / 가든 양재천점 / 가든 판교점 (2026-07-31 대표 지시).
  // 구버전 호환: unit 없이 brand 만 오면 staffmeal→staffmeal, 그 외→양재천으로는 매핑하지 않고 에러.
  const unit = unitOf(body.unit ?? (body.brand === 'staffmeal' ? 'staffmeal' : null));
  if (!unit) return NextResponse.json({ error: '확정 단위(unit)가 올바르지 않습니다.' }, { status: 400 });
  const brand = unit.brand;
  const store = unit.store ?? ''; // monthly_close.store — 스탭밀은 ''
  if (!ym || !/^\d{4}-\d{2}$/.test(ym) || (action !== 'confirm' && action !== 'reopen' && action !== 'resnap')) {
    return NextResponse.json({ error: '월(YYYY-MM)과 동작(confirm/reopen/resnap)이 필요합니다.' }, { status: 400 });
  }

  // 재결산 — 잠금 상태는 그대로 두고 결산값만 새 버전으로 얼린다.
  // 결산 후 데이터가 바뀌어(변동 감지) 그 변경이 맞다고 판단했을 때 누른다.
  if (action === 'resnap') {
    const { data: closed } = await supabase
      .schema('finance')
      .from('monthly_close')
      .select('status')
      .eq('ym', ym).eq('brand', brand).eq('store', store)
      .maybeSingle();
    if (closed?.status !== 'confirmed') {
      return NextResponse.json({ error: '확정된 달만 재결산할 수 있어요. 먼저 월 결산을 해주세요.' }, { status: 409 });
    }
    // 재결산도 확정과 같은 게이트 — 확정 후 유입된 미분류·지점 미지정 거래가 있는 채로
    // 새 버전을 얼리면 불완전한 숫자가 '답안지'가 된다(2026-08-21 감사 P3-5)
    let reUnclQ = supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ym', ym)
      .eq('brand', brand)
      .is('category_id', null);
    if (unit.store) reUnclQ = reUnclQ.eq('store', unit.store);
    const { count: reUncl } = await reUnclQ;
    if (reUncl && reUncl > 0) {
      return NextResponse.json(
        { error: `미분류 ${reUncl}건이 남아 재결산할 수 없어요 — 먼저 분류를 마쳐주세요.`, unclassified: reUncl },
        { status: 409 }
      );
    }
    if (unit.store) {
      // 확정과 같은 규칙 — 순수 손익 제외(excluded, 미상 제외)는 안 센다(2026-08-23)
      const reUnassigned = await countUnassignedGarden(supabase, ym);
      if (reUnassigned > 0) {
        return NextResponse.json(
          { error: `지점 미지정 가든 거래 ${reUnassigned}건이 남아 재결산할 수 없어요 — 분류 화면에서 지점을 지정해주세요.`, unassigned: reUnassigned },
          { status: 409 }
        );
      }
    }
    const snap = await saveSnapshot(supabase, user.id, ym, brand, store, unit);
    if ('error' in snap) return NextResponse.json({ error: snap.error }, { status: 500 });
    await logActivity(supabase, user, '월 재결산', `${ym} [${unit.label}] v${snap.version}`);
    return NextResponse.json({ ym, unit: unit.id, status: 'confirmed', snapshotVersion: snap.version });
  }

  const now = new Date().toISOString();

  if (action === 'confirm') {
    // 해당 월·단위 거래 수 · 미분류 수를 서버에서 재확인
    let totalQ = supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ym', ym)
      .eq('brand', brand);
    if (unit.store) totalQ = totalQ.eq('store', unit.store);
    const { count: total } = await totalQ;
    if (!total) {
      return NextResponse.json({ error: '해당 월에 확정할 거래가 없습니다.' }, { status: 422 });
    }
    let unclQ = supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ym', ym)
      .eq('brand', brand)
      .is('category_id', null);
    if (unit.store) unclQ = unclQ.eq('store', unit.store);
    const { count: unclassified } = await unclQ;
    if (unclassified && unclassified > 0) {
      return NextResponse.json(
        { error: `미분류 ${unclassified}건이 남아 확정할 수 없습니다.`, unclassified },
        { status: 409 }
      );
    }
    // 가든 지점 확정은 '지점 미지정' 가든 거래도 0건이어야 함 — 미지정이 남으면 지점 손익이 불완전한 채 잠긴다.
    // 단 순수 손익 제외(excluded, 미상 제외) 분류는 안 센다 — '개인 지출' 파킹 건이 결산을 막지 않게(2026-08-23).
    if (unit.store) {
      const unassigned = await countUnassignedGarden(supabase, ym);
      if (unassigned > 0) {
        return NextResponse.json(
          { error: `지점 미지정 가든 거래 ${unassigned}건이 남아 확정할 수 없습니다. 분류 화면에서 지점을 지정하거나 분할해주세요.`, unassigned },
          { status: 409 }
        );
      }
    }

    const { error } = await supabase
      .schema('finance')
      .from('monthly_close')
      .upsert(
        { ym, brand, store, status: 'confirmed', confirmed_by: user.id, confirmed_at: now, updated_at: now },
        { onConflict: 'ym,brand,store' }
      );
    if (error) return NextResponse.json({ error: `확정 실패: ${error.message}` }, { status: 500 });
    // 결산값을 얼린다 — 이 시점의 전처리1·2·3 집계가 이 달의 '답안지'가 된다.
    // 실패해도 확정 자체는 유지(스냅샷은 검증 기록, 잠금이 본체) — 화면에 스냅샷 없음이 표시된다.
    const snap = await saveSnapshot(supabase, user.id, ym, brand, store, unit);
    await logActivity(supabase, user, '월 결산', `${ym} [${unit.label}]${'version' in snap ? ` v${snap.version}` : ' (결산값 저장 실패)'}`);
    return NextResponse.json({
      ym, unit: unit.id, status: 'confirmed', confirmed_at: now,
      snapshotVersion: 'version' in snap ? snap.version : null,
    });
  }

  // reopen
  const { error } = await supabase
    .schema('finance')
    .from('monthly_close')
    .upsert(
      { ym, brand, store, status: 'open', confirmed_by: null, confirmed_at: null, updated_at: now },
      { onConflict: 'ym,brand,store' }
    );
  if (error) return NextResponse.json({ error: `재오픈 실패: ${error.message}` }, { status: 500 });
  await logActivity(supabase, user, '월 확정 재오픈', `${ym} [${unit.label}]`);
  return NextResponse.json({ ym, unit: unit.id, status: 'open' });
}


// 결산값 저장 — (ym, brand, store) 의 다음 버전으로 insert (append-only)
async function saveSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ym: string,
  brand: string,
  store: string,
  unit: NonNullable<ReturnType<typeof unitOf>>
): Promise<{ version: number; figures: SnapshotFigures } | { error: string }> {
  try {
    const figures = await computeMonthlyFigures(supabase, unit, ym);
    const { data: last } = await supabase
      .schema('finance')
      .from('close_snapshots')
      .select('version')
      .eq('ym', ym).eq('brand', brand).eq('store', store)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = ((last?.version as number | undefined) ?? 0) + 1;
    const { error } = await supabase
      .schema('finance')
      .from('close_snapshots')
      .insert({ ym, brand, store, version, figures: figures as never, created_by: userId });
    if (error) return { error: `결산값 저장 실패: ${error.message}` };
    return { version, figures };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
