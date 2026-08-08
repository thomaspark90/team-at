import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import { REVIEW_ACTION_STATUSES } from '@/lib/garden/review-constants';

export const runtime = 'nodejs';

// 네이버 리뷰 탭 배지용 — 매니저 액션이 필요한(수집됨·초안 대기) 건수만 반환.
// approved는 자동 게시 대기라 세지 않는다 (미처리 탭 기준과 다름 — review-constants 참고).

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(supabase, user, 'reviews');
  if (denied) return denied;

  const { count, error } = await supabase
    .schema('finance')
    .from('place_reviews')
    .select('id', { count: 'exact', head: true })
    .in('status', REVIEW_ACTION_STATUSES);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
