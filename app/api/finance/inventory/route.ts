import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 월별 기말재고 저장(upsert). { ym, kind: '식자재'|'포장소모품', amount }
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
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: '월(ym)이 올바르지 않습니다.' }, { status: 400 });
  if (!['식자재', '포장소모품'].includes(kind)) return NextResponse.json({ error: '구분이 올바르지 않습니다.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: '금액이 올바르지 않습니다.' }, { status: 400 });

  const { error } = await supabase
    .schema('finance')
    .from('inventory')
    .upsert(
      { ym, kind, amount, entered_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'ym,kind' },
    );
  if (error) return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, ym, kind, amount });
}
