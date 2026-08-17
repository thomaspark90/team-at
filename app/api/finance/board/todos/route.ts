import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { computeBoardTodos, computeUnclassifiedByMonth } from '@/lib/finance/boardTodos';

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

  const params = new URL(req.url).searchParams;
  const brandRaw = params.get('brand');
  const brand = brandRaw && ['garden', 'staffmeal', 'personal'].includes(brandRaw) ? brandRaw : undefined;
  // ?store= (가든 지점 페이지) — POS 항목 집계를 그 지점만으로 좁힌다
  const storeRaw = params.get('store');
  const store = storeRaw && ['yangjae', 'pangyo'].includes(storeRaw) ? storeRaw : undefined;
  // kind=uncl → 월별 미분류 '건수'(분류 화면 배지). 기본 = 남은 업무 수(자료 입력 배지)
  const kind = params.get('kind') === 'uncl' ? 'uncl' : 'todos';

  try {
    return NextResponse.json({
      counts:
        kind === 'uncl'
          ? await computeUnclassifiedByMonth(supabase, brand, store)
          : await computeBoardTodos(supabase, brand, store),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '집계에 실패했어요.' }, { status: 500 });
  }
}
