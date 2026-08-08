import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';

export const runtime = 'nodejs';

// 네이버 리뷰 탭 배지용 — 액션 필요(수집됨·초안 대기·게시 대기) 리뷰 건수만 반환.
// 목록 API(../route.ts)의 tab=open과 같은 기준을 쓴다.
const OPEN_STATUSES = ['new', 'drafted', 'approved'];

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
    .in('status', OPEN_STATUSES);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
