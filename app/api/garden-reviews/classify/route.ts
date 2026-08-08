import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { checkAiQuota } from '@/lib/access/rate-limit';
import { requireGardenTab } from '@/lib/access/guard';
import { classifyBacklog } from '@/lib/garden/review-classify';

const ACTION = '리뷰 AI 분류';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 기존 리뷰 이슈 분류 백필 (로그인 세션 인증).
// 실제 배치 로직은 lib/garden/review-classify 가 담당 — 일일 크론(cron/review-classify)과 공유한다.
// UI(이슈·개선 탭)의 '분류 실행' 버튼이 remaining=0 이 될 때까지 반복 호출한다.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'reviews');
    if (denied) return denied;
  }
  // UI 가 remaining=0 이 될 때까지 반복 호출하는 배치라 상한을 넉넉히 둔다
  const over = await checkAiQuota(supabase, user, ACTION, 300);
  if (over) return over;

  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 });

  const result = await classifyBacklog(supabase.schema('finance'), supabase, key);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  // 사용량 상한이 이 로그 건수를 세므로 호출마다 남긴다
  await logActivity(supabase, user, ACTION, `${result.classified}건 분류`);
  return NextResponse.json({ classified: result.classified, remaining: result.remaining });
}
