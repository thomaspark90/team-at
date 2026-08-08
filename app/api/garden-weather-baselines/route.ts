import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';

export const runtime = 'nodejs';

// 요일별 기준 잔수 조회 — 날씨 스트립의 '내일 예상 잔수·원두' 자동 최신화용.
// 값은 날씨×판매 분석이 계산할 때마다 Blob 에 기록된다(garden-weather-sales).
// 재무 권한 없는 가든 대시보드 사용자도 읽을 수 있게 별도 라우트로 분리(집계 통계만 노출).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(supabase, user, 'dashboard');
  if (denied) return denied;

  try {
    const res = await get('data/garden-weather-baselines.json', { access: 'private', useCache: false });
    if (!res) return NextResponse.json({ error: '아직 계산된 기준이 없어요.' }, { status: 404 });
    return NextResponse.json(JSON.parse(await new Response(res.stream).text()));
  } catch {
    return NextResponse.json({ error: '아직 계산된 기준이 없어요.' }, { status: 404 });
  }
}
