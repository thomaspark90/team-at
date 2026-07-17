import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { brandLabel } from '@/lib/finance/types';

export const runtime = 'nodejs';

// 월별·브랜드별 기말재고 저장(upsert). { ym, kind: '식자재'|'포장소모품', amount, brand? }
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
  const kind = String(body?.kind ?? '');
  const amount = Math.round(Number(body?.amount));
  const brand = String(body?.brand ?? 'garden');
  if (!['garden', 'staffmeal'].includes(brand)) return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: '월(ym)이 올바르지 않습니다.' }, { status: 400 });
  if (!['식자재', '포장소모품'].includes(kind)) return NextResponse.json({ error: '구분이 올바르지 않습니다.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: '금액이 올바르지 않습니다.' }, { status: 400 });

  // 확정된 달은 기말재고를 바꿀 수 없음(확정 후 원가 변동 방지) — pos/save·uploads/delete와 동일 규칙
  const { data: close } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('status')
    .eq('ym', ym)
    .maybeSingle();
  if (close?.status === 'confirmed') {
    return NextResponse.json({ error: `${ym}은 이미 확정된 달이라 기말재고를 바꿀 수 없어요.` }, { status: 409 });
  }

  const { error } = await supabase
    .schema('finance')
    .from('inventory')
    .upsert(
      { ym, kind, brand, amount, entered_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'ym,kind,brand' },
    );
  if (error) return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });

  await logActivity(supabase, user, '기말재고 입력', `${brandLabel(brand)} · ${ym} ${kind} ${amount.toLocaleString('ko-KR')}원`);
  return NextResponse.json({ ok: true, ym, kind, brand, amount });
}
