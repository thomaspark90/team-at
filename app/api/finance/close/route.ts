import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canConfirm } from '@/lib/finance/access';

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

  let body: { ym?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const ym = body.ym;
  const action = body.action;
  if (!ym || !/^\d{4}-\d{2}$/.test(ym) || (action !== 'confirm' && action !== 'reopen')) {
    return NextResponse.json({ error: '월(YYYY-MM)과 동작(confirm/reopen)이 필요합니다.' }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (action === 'confirm') {
    // 해당 월 거래 수 · 미분류 수를 서버에서 재확인
    const { count: total } = await supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ym', ym);
    if (!total) {
      return NextResponse.json({ error: '해당 월에 확정할 거래가 없습니다.' }, { status: 422 });
    }
    const { count: unclassified } = await supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ym', ym)
      .is('category_id', null);
    if (unclassified && unclassified > 0) {
      return NextResponse.json(
        { error: `미분류 ${unclassified}건이 남아 확정할 수 없습니다.`, unclassified },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .schema('finance')
      .from('monthly_close')
      .upsert(
        { ym, status: 'confirmed', confirmed_by: user.id, confirmed_at: now, updated_at: now },
        { onConflict: 'ym' }
      );
    if (error) return NextResponse.json({ error: `확정 실패: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ym, status: 'confirmed', confirmed_at: now });
  }

  // reopen
  const { error } = await supabase
    .schema('finance')
    .from('monthly_close')
    .upsert(
      { ym, status: 'open', confirmed_by: null, confirmed_at: null, updated_at: now },
      { onConflict: 'ym' }
    );
  if (error) return NextResponse.json({ error: `재오픈 실패: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ym, status: 'open' });
}
