import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { classifyBacklog } from '@/lib/garden/review-classify';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 리뷰 이슈 분류 백필 크론(매일 10:30 KST, vercel.json crons) — 수집 시점에 초안·분류가
// 실패해 미분류로 남은 리뷰를 자동으로 정리한다. 사람이 '분류 실행' 버튼을 누르지 않아도
// 불만 리뷰 알림이 하루 안에는 나가게 하는 안전망. 인증은 Vercel 크론의 CRON_SECRET Bearer 헤더.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!url || !serviceKey || !geminiKey) {
    return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  }

  const db = createServiceClient(url, serviceKey, { db: { schema: 'finance' } });
  const notifyClient = createServiceClient(url, serviceKey);

  // remaining=0 이 될 때까지 배치 반복 — 진전이 없으면(연속 실패) 중단, 시간 예산 45초
  const deadline = Date.now() + 45_000;
  let total = 0;
  let remaining = 0;
  for (let i = 0; i < 20; i++) {
    const r = await classifyBacklog(db, notifyClient, geminiKey);
    if (r.error) return NextResponse.json({ error: r.error, classified: total }, { status: 500 });
    total += r.classified;
    remaining = r.remaining;
    if (remaining === 0 || r.classified === 0 || Date.now() > deadline) break;
  }
  return NextResponse.json({ classified: total, remaining });
}
