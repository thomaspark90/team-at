import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 월별·브랜드별 채널수수료 저장. { ym, amount, brand? }. amount=null 이면 삭제(추정으로 되돌림).
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
  if (!['garden', 'staffmeal'].includes(brand)) return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: '월(ym)이 올바르지 않습니다.' }, { status: 400 });

  // 확정된 달·브랜드는 변경 불가(다른 재무 라우트와 동일 규칙) — brand 조건 필수((ym,brand) 단위 확정)
  const { data: close } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('status')
    .eq('ym', ym)
    .eq('brand', brand)
    .maybeSingle();
  if (close?.status === 'confirmed') {
    return NextResponse.json({ error: `${ym}은 이미 확정된 달이라 채널수수료를 바꿀 수 없어요.` }, { status: 409 });
  }

  // amount 미지정/null → 삭제(추정으로 복귀)
  if (body?.amount == null || body?.amount === '') {
    const { error } = await supabase.schema('finance').from('channel_fees').delete().eq('ym', ym).eq('brand', brand);
    if (error) return NextResponse.json({ error: `삭제 실패: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, ym, brand, amount: null });
  }

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: '금액이 올바르지 않습니다.' }, { status: 400 });

  const { error } = await supabase
    .schema('finance')
    .from('channel_fees')
    .upsert({ ym, brand, amount, entered_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'ym,brand' });
  if (error) return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, ym, brand, amount });
}
