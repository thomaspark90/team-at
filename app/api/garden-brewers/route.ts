import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { requireGardenTab } from '@/lib/access/guard';
import { logActivity } from '@/lib/finance/activity';
import { cleanBrewerIds, effectiveBrewerIds, type BrewerStaffRow } from '@/lib/garden/brewers';
import { brewerStaffRows, readBrewerIds, writeBrewerIds } from '@/lib/garden/brewers-server';

export const runtime = 'nodejs';

// 필터커피 내리는 사람(가든서비스 › 설정) — 레시피 보드의 이름 버튼 · 추출 평가의 이름 선택지.
// GET → { staff: [{ id, name, homeStore, on }], custom }  (custom = 설정에서 저장한 적이 있는지)
// PUT { staffIds: number[] } → 명단 전체 교체, 같은 모양으로 응답.
// 읽기 · 쓰기 모두 설정 탭 권한. 보드는 이 API 가 아니라 /api/garden-recipe-board 가 명단을 내려 준다.

const view = (rows: BrewerStaffRow[], saved: number[] | null) => {
  const on = new Set(effectiveBrewerIds(rows, saved));
  return {
    custom: saved !== null,
    staff: rows
      .filter((r) => r.active)
      .map((r) => ({ id: r.id, name: r.name, homeStore: r.home_store ?? null, on: on.has(r.id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
  };
};

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(supabase, user, 'settings');
  if (denied) return denied;
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  return { supabase, user, svc };
}

export async function GET() {
  const a = await gate();
  if (a instanceof NextResponse) return a;
  const [rows, saved] = await Promise.all([brewerStaffRows(a.svc), readBrewerIds()]);
  return NextResponse.json(view(rows, saved));
}

export async function PUT(req: Request) {
  const a = await gate();
  if (a instanceof NextResponse) return a;
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.staffIds)) {
    return NextResponse.json({ error: 'staffIds 가 필요합니다.' }, { status: 400 });
  }
  const rows = await brewerStaffRows(a.svc);
  const ids = cleanBrewerIds(body.staffIds, rows);
  await writeBrewerIds(ids, a.user.email ?? '');
  const names = rows.filter((r) => ids.includes(r.id)).map((r) => r.name).sort((x, y) => x.localeCompare(y, 'ko'));
  await logActivity(a.supabase, a.user, '가든서비스 필터커피 내리는 사람 설정', names.length ? names.join(', ') : '없음');
  return NextResponse.json(view(rows, ids));
}
