import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import { fetchItemRows } from '@/lib/garden/menu-sales';
import { computeBeanUsage, BEAN_USAGE_WINDOW_DAYS } from '@/lib/garden/bean-usage';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 원두 일 사용량(발주 참고) — 작업 보드 날씨 줄 아래 스트립이 읽는다. 산식은 lib/garden/bean-usage.
// dashboard_pos_items 뷰는 재무 역할(my_role) 이 있어야 행이 보이므로, 역할 없는 계정엔 빈 배열이 간다.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(supabase, user, ['dashboard', 'pricing', 'weather']);
  if (denied) return denied;

  // 마지막 판매일이 오늘보다 뒤처질 수 있어 창(28일)의 두 배를 읽고 계산 모듈이 잘라 쓴다.
  const since = new Date(Date.now() - BEAN_USAGE_WINDOW_DAYS * 2 * 86_400_000).toISOString().slice(0, 10);
  try {
    const rows = await fetchItemRows(supabase, { brand: 'garden', since });
    return NextResponse.json({ stores: computeBeanUsage(rows) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '조회 실패' }, { status: 500 });
  }
}
