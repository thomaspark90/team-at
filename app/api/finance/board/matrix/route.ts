import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { computeBoardMatrix } from '@/lib/finance/boardTodos';

export const runtime = 'nodejs';

// 전체 자료 현황 매트릭스(행=연·월 × 열=자료 종류) — 자료 입력 페이지 조망용.
// 집계 규칙은 월 배지와 공유(lib/finance/boardTodos.computeBoardMatrix).
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
    return NextResponse.json(await computeBoardMatrix(supabase, brand));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '집계에 실패했어요.' }, { status: 500 });
  }
}
