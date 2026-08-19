import { NextResponse } from 'next/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { fetchRawBatches, fetchRawRows, isRawSource } from '@/lib/finance/rawQuery';

export const runtime = 'nodejs';

// 로우데이터 페이지의 무한스크롤 — 월 단위로 배치를 잡고 그 안의 원본 행을 오프셋으로 넘긴다.
export async function GET(req: Request) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const source = url.searchParams.get('source');
  if (!isRawSource(source)) return NextResponse.json({ error: '출처가 올바르지 않습니다.' }, { status: 400 });
  const brand = url.searchParams.get('brand');
  const ym = url.searchParams.get('ym');
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 200) || 200));

  try {
    const batches = await fetchRawBatches(supabase, { source, brand, ym });
    const rows = await fetchRawRows(
      supabase,
      batches.map((b) => b.id),
      { offset, limit }
    );
    return NextResponse.json({ rows, hasMore: rows.length === limit });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
