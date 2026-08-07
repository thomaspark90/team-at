import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrinderProfiles, GrindPoint } from '@/lib/grinder-calibration';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { requireGardenTab } from '@/lib/access/guard';
import { latestAlignmentDate, kstDate } from '@/lib/grinder-alignments';
import { alignmentRecords } from '@/lib/blob-records';

const DATA_PATH = 'data/garden-grinders.json';
const STORE_IDS = STORES.map((s) => s.id);

// 얼라인 이력은 기록별 blob 컬렉션에서 읽는다 (구 단일 파일은 이관 후 사라짐)
const readAlignments = () => alignmentRecords.readAll();

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

  // 얼라인먼트 이후에 저장된 측정점만 유효 — 얼라인 이전 피팅이 '확정 환산'으로
  // 계속 표시되는 것을 막는다(모든 소비 화면에 일괄 적용). updatedAt이 없는 구 데이터도
  // 해당 지점에 얼라인 기록이 있으면 무효 처리한다.
  const events = await readAlignments();
  for (const id of STORE_IDS) {
    const p = store.profiles[id];
    if (!p) continue;
    const lastAlign = latestAlignmentDate(events, id);
    if (!lastAlign) continue;
    if (!p.updatedAt || kstDate(p.updatedAt) < lastAlign) delete store.profiles[id];
  }
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
