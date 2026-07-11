import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

// 클라이언트 전용 기능(스탭밀 다운로드 등)의 사용 기록. 허용된 action만 받는다.
const ALLOWED_ACTIONS = new Set([
  '스탭밀 스토리 다운로드',
  '스탭밀 배경 업로드',
  '스탭밀 배경 삭제',
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? '');
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: '허용되지 않은 action입니다.' }, { status: 400 });
  }
  const detail = body?.detail != null ? String(body.detail).slice(0, 200) : null;

  await logActivity(supabase, user, action, detail);
  return NextResponse.json({ ok: true });
}
