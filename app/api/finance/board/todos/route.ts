import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { computeBoardTodos } from '@/lib/finance/boardTodos';

export const runtime = 'nodejs';

// 월 스트립 배지용 — 집계 로직은 lib/finance/boardTodos.ts (대시보드 서버 프리페치와 공용)
// ?brand= 로 페이지 브랜드 몫만 집계(미지정 = 전 브랜드 합산, 구버전 호환)
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '회계 권한이 없습니다.' }, { status: 403 });
  }

  const brandRaw = new URL(req.url).searchParams.get('brand');
  const brand = brandRaw && ['garden', 'staffmeal', 'personal'].includes(brandRaw) ? brandRaw : undefined;

  try {
    return NextResponse.json({ counts: await computeBoardTodos(supabase, brand) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '집계에 실패했어요.' }, { status: 500 });
  }
}
