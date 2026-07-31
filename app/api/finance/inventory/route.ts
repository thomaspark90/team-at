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

  // 확정된 달은 기말재고를 바꿀 수 없음(확정 후 원가 변동 방지).
  // 재고는 브랜드 단위 입력인데 확정은 지점 단위 — 그 브랜드의 어느 한 단위라도 확정이면 잠근다
  // (지점 손익이 재고를 매출비율로 안분하므로, 한 지점 확정 후 재고가 바뀌면 확정 숫자가 흔들린다).
  const { data: closeRows } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('status')
    .eq('ym', ym)
    .eq('brand', brand)
    .eq('status', 'confirmed');
  if ((closeRows ?? []).length > 0) {
    return NextResponse.json({ error: `${ym}은 이미 확정된 단위가 있어 기말재고를 바꿀 수 없어요.` }, { status: 409 });
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
