import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 월별·브랜드별(·지점별) 채널수수료 저장. { ym, amount, brand?, store? }. amount=null 이면 삭제(추정으로 되돌림).
// store: ''=브랜드 단위(레거시, 지점 뷰에선 매출비율 안분) / 'yangjae'·'pangyo'=지점 실액(2026-08-23, G5 선행).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const ym = String(body?.ym ?? '');
  const brand = String(body?.brand ?? 'garden');
  const store = String(body?.store ?? '');
  if (!['garden', 'staffmeal'].includes(brand)) return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  if (!['', 'yangjae', 'pangyo'].includes(store) || (brand === 'staffmeal' && store !== '')) {
    return NextResponse.json({ error: '지점이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: '월(ym)이 올바르지 않습니다.' }, { status: 400 });

  // 확정된 달은 변경 불가 — 수수료는 브랜드 단위 입력인데 확정은 지점 단위라,
  // 그 브랜드의 어느 한 단위라도 확정이면 잠근다(지점 안분 숫자 보호).
  const { data: closeRows } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('status')
    .eq('ym', ym)
    .eq('brand', brand)
    .eq('status', 'confirmed');
  if ((closeRows ?? []).length > 0) {
    return NextResponse.json({ error: `${ym}은 이미 확정된 단위가 있어 채널수수료를 바꿀 수 없어요.` }, { status: 409 });
  }

  // amount 미지정/null → 삭제(추정으로 복귀). 자기 (브랜드, 지점) 행만.
  if (body?.amount == null || body?.amount === '') {
    const { error } = await supabase
      .schema('finance')
      .from('channel_fees')
      .delete()
      .eq('ym', ym)
      .eq('brand', brand)
      .eq('store', store);
    if (error) return NextResponse.json({ error: `삭제 실패: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, ym, brand, store, amount: null });
  }

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: '금액이 올바르지 않습니다.' }, { status: 400 });

  const { error } = await supabase
    .schema('finance')
    .from('channel_fees')
    .upsert({ ym, brand, store, amount, entered_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'ym,brand,store' });
  if (error) return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, ym, brand, store, amount });
}
