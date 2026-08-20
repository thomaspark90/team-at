import { NextResponse } from 'next/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { unitOf } from '@/lib/finance/types';
import { computeMonthlyFigures, diffFigures, type SnapshotFigures } from '@/lib/finance/closeSnapshot';

export const runtime = 'nodejs';

// 결산값 조회 + 변동 감지 — 최신 결산값과 '지금 다시 계산한 값'의 차이를 돌려준다.
// 결산은 데이터를 잠그지 않으므로(유연 모드), 결산 후 재분류가 있었으면 여기서 드러난다.
export async function GET(req: Request) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const ym = url.searchParams.get('ym');
  const unit = unitOf(url.searchParams.get('unit'));
  if (!ym || !/^\d{4}-\d{2}$/.test(ym) || !unit) {
    return NextResponse.json({ error: 'ym(YYYY-MM)과 unit이 필요합니다.' }, { status: 400 });
  }

  const { data: snaps, error } = await supabase
    .schema('finance')
    .from('close_snapshots')
    .select('version,figures,created_at,note')
    .eq('ym', ym)
    .eq('brand', unit.brand)
    .eq('store', unit.store ?? '')
    .order('version', { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: `결산값 조회 실패: ${error.message}` }, { status: 500 });

  const latest = snaps?.[0] ?? null;
  if (!latest) return NextResponse.json({ snapshot: null, diffs: [], history: [] });

  try {
    const current = await computeMonthlyFigures(supabase, unit, ym);
    const diffs = diffFigures(latest.figures as SnapshotFigures, current);
    return NextResponse.json({
      snapshot: { version: latest.version, createdAt: latest.created_at, figures: latest.figures },
      diffs,
      history: (snaps ?? []).map((s) => ({ version: s.version, createdAt: s.created_at })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
