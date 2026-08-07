import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrinderProfiles, GrindPoint } from '@/lib/grinder-calibration';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { requireGardenTab } from '@/lib/access/guard';

const DATA_PATH = 'data/garden-grinders.json';
const STORE_IDS = STORES.map((s) => s.id);

async function readStore(): Promise<{ profiles: GrinderProfiles }> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { profiles: {} };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as { profiles: GrinderProfiles };
  } catch {
    return { profiles: {} };
  }
}

async function writeStore(store: { profiles: GrinderProfiles }) {
  await put(DATA_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, ['calibration', 'dashboard', 'recipes', 'beancard']);
    if (denied) return denied;
  }

  const store = await readStore();
  return NextResponse.json(store.profiles);
}

// 지점 그라인더 측정점 저장(교체): { store: 'pangyo'|'yangjae', points: [{dial, micron}] }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, ['calibration', 'dashboard']);
    if (denied) return denied;
  }

  const body = await req.json();
  const storeId = body.store as StoreId;
  if (!STORE_IDS.includes(storeId)) {
    return NextResponse.json({ error: '지점 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  // 유효 측정점만 — EK43 다이얼 0~13, 입자 100~1500µm 범위로 방어
  const points: GrindPoint[] = (Array.isArray(body.points) ? body.points : [])
    .map((p: { dial: unknown; micron: unknown }) => ({ dial: Number(p.dial), micron: Number(p.micron) }))
    .filter(
      (p: GrindPoint) =>
        Number.isFinite(p.dial) && p.dial >= 0 && p.dial <= 13 &&
        Number.isFinite(p.micron) && p.micron >= 100 && p.micron <= 1500
    )
    .sort((a: GrindPoint, b: GrindPoint) => a.dial - b.dial);

  const data = await readStore();
  data.profiles[storeId] = {
    points,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email ?? '',
  };
  await writeStore(data);

  const label = STORES.find((s) => s.id === storeId)?.label ?? storeId;
  await logActivity(
    supabase,
    user,
    '가든서비스 그라인더 측정점 저장',
    `${label} · ${points.length}점` +
      (points.length ? ` (${points.map((p) => `${p.dial}→${p.micron}µm`).join(', ')})` : '')
  );
  return NextResponse.json(data.profiles);
}
