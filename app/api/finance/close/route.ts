import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { canConfirm } from '@/lib/finance/access';
import { unitOf } from '@/lib/finance/types';

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
  if (!ym || !/^\d{4}-\d{2}$/.test(ym) || (action !== 'confirm' && action !== 'reopen')) {
    return NextResponse.json({ error: '월(YYYY-MM)과 동작(confirm/reopen)이 필요합니다.' }, { status: 400 });
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
    // 가든 지점 확정은 '지점 미지정' 가든 거래도 0건이어야 함 — 미지정이 남으면 지점 손익이 불완전한 채 잠긴다
    if (unit.store) {
      const { count: unassigned } = await supabase
        .schema('finance')
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('ym', ym)
        .eq('brand', 'garden')
        .is('store', null);
      if (unassigned && unassigned > 0) {
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
    await logActivity(supabase, user, '월 확정', `${ym} [${unit.label}]`);
    return NextResponse.json({ ym, unit: unit.id, status: 'confirmed', confirmed_at: now });
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
