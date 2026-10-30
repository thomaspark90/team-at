import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import {
  GUIDE_COSTS,
  GUIDE_MULTS,
  cleanActiveCells,
  defaultActiveCells,
  type ActiveCells,
} from '@/lib/garden/price-bands';

// 판매가 설정 참고표의 칸별 권장(초록)/비활성(회색) 상태 — 판매가 설정 탭 담당자가 클릭으로 편집
const DATA_PATH = 'data/garden-price-bands.json';

async function readCells(): Promise<ActiveCells | null> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return null;
  try {
    return cleanActiveCells(JSON.parse(await new Response(res.stream).text()).cells);
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'saleprice');
    if (denied) return denied;
  }
  return NextResponse.json({ cells: (await readCells()) ?? defaultActiveCells() });
}

// 칸 하나 토글: { cost, mult, active } — 서버에서 최신 상태에 적용해 동시 편집 시 다른 칸을 덮지 않는다
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'saleprice');
    if (denied) return denied;
  }

  const body = await req.json();
  const cost = Number(body.cost);
  const mult = Number(body.mult);
  if (!GUIDE_COSTS.includes(cost) || !GUIDE_MULTS.includes(mult)) {
    return NextResponse.json({ error: '표에 없는 칸입니다.' }, { status: 400 });
  }
  const cells = (await readCells()) ?? defaultActiveCells();
  const row = new Set(cells[String(cost)] ?? []);
  if (body.active) row.add(mult);
  else row.delete(mult);
  cells[String(cost)] = GUIDE_MULTS.filter((m) => row.has(m));

  await put(DATA_PATH, JSON.stringify({ cells, updatedAt: new Date().toISOString(), updatedBy: user.email ?? '' }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return NextResponse.json({ cells });
}
