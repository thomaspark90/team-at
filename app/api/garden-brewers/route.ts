import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { requireGardenTab } from '@/lib/access/guard';
import { logActivity } from '@/lib/finance/activity';
import { STORES, type StoreId } from '@/lib/types';
import { cleanBrewerIds, effectiveBrewerIds, storeStaff, type BrewerSaved, type BrewerStaffRow } from '@/lib/garden/brewers';
import { brewerStaffRows, readBrewerSaved, writeBrewerSaved } from '@/lib/garden/brewers-server';

export const runtime = 'nodejs';

// 필터커피 내리는 사람(가든서비스 › 설정) — 필터커피 라인업의 이름 버튼 · 추출 평가의 이름 선택지. 지점별 명단.
// GET → { stores: [{ id, label, custom, staff: [{ id, name, on }] }] }
//        staff = 그 지점에서 근무하는 재직자, custom = 그 지점 명단을 설정에서 저장한 적이 있는지
// PUT { store, staffIds: number[] } → 그 지점 명단 전체 교체, 같은 모양으로 응답.
// 읽기 · 쓰기 모두 설정 탭 권한. 라인업 화면은 이 API 가 아니라 /api/garden-recipe-board 가 명단을 내려 준다.

const view = (rows: BrewerStaffRow[], saved: BrewerSaved) => ({
  // 지점 순서는 라인업 화면과 같이 양재천 먼저
  stores: [...STORES].reverse().map((s) => {
    const on = new Set(effectiveBrewerIds(rows, saved, s.id));
    return {
      id: s.id,
      label: s.label,
      custom: !!saved[s.id],
      staff: storeStaff(rows, s.id)
        .map((r) => ({ id: r.id, name: r.name, on: on.has(r.id) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    };
  }),
});

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
  const [rows, saved] = await Promise.all([brewerStaffRows(a.svc), readBrewerSaved()]);
  return NextResponse.json(view(rows, saved));
}

export async function PUT(req: Request) {
  const a = await gate();
  if (a instanceof NextResponse) return a;
  const body = await req.json().catch(() => null);
  const store = body?.store as StoreId;
  if (!STORES.some((s) => s.id === store)) return NextResponse.json({ error: '지점 정보가 없습니다.' }, { status: 400 });
  if (!Array.isArray(body.staffIds)) return NextResponse.json({ error: 'staffIds 가 필요합니다.' }, { status: 400 });

  const [rows, prev] = await Promise.all([brewerStaffRows(a.svc), readBrewerSaved()]);
  const list = cleanBrewerIds(body.staffIds, rows, store);
  const saved: BrewerSaved = { ...prev, [store]: list };
  await writeBrewerSaved(saved, a.user.email ?? '');
  const names = rows.filter((r) => list.includes(r.id)).map((r) => r.name).sort((x, y) => x.localeCompare(y, 'ko'));
  const label = STORES.find((s) => s.id === store)?.short ?? store;
  await logActivity(a.supabase, a.user, '가든서비스 필터커피 내리는 사람 설정', `${label} · ${names.length ? names.join(', ') : '없음'}`);
  return NextResponse.json(view(rows, saved));
}
