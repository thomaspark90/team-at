import { NextResponse } from 'next/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fetchRawTotals, isRawSource } from '@/lib/finance/rawQuery';
import { parseRawQuery } from '@/lib/finance/rawParams';

export const runtime = 'nodejs';

// 로우데이터 소계 — 지금 걸린 필터·기간의 '전체 행' 기준 행 수 + 금액 열 합계.
// 표는 200행씩 페이징이라 클라이언트 합계로는 전체 소계를 낼 수 없어 서버(raw_rows_totals)가 집계한다.
// cols = 합산할 payload 열 인덱스(쉼표 구분, 예: cols=4,5 — 찾으신금액·맡기신금액).
export async function GET(req: Request) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 });
  }

  const url = new URL(req.url);
  if (!isRawSource(url.searchParams.get('source'))) {
    return NextResponse.json({ error: '출처가 올바르지 않습니다.' }, { status: 400 });
  }
  const query = parseRawQuery(url.searchParams);
  const cols = (url.searchParams.get('cols') ?? '')
    .split(',')
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v < 100)
    .slice(0, 8);

  try {
    const totals = await fetchRawTotals(supabase, query, cols);
    return NextResponse.json(totals);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
