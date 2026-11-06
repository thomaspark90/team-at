import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { staffNameRows } from '@/lib/staff/directory';
import { staffLabel } from '@/lib/staff/names';
import type { BrewFeedback, BrewType, StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { brewFeedbackRecords } from '@/lib/blob-records';
import { FEEDBACK_CHIPS, GOOD_CHIP, roundMesh } from '@/lib/garden/brew-feedback';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { requireGardenTab } from '@/lib/access/guard';

// 추출 평가 — 태블릿 레시피 보드에서 스탭이 남기는 칩 의견. 레시피는 바꾸지 않는다.
// GET: 전체(오래된 순) / POST: 한 건 추가

async function guard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const denied = await requireGardenTab(supabase, user, 'recipes');
  if (denied) return { error: denied };
  return { supabase, user };
}

export async function GET() {
  const g = await guard();
  if ('error' in g) return g.error;
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  const [records, staffRows] = await Promise.all([brewFeedbackRecords.readAll(), staffNameRows(svc)]);
  // 원본은 그대로 두고 표시 이름만 명부에 맞춘다(소진 → 김소진, 퇴사자는 이름(퇴사))
  return NextResponse.json(records.map((f) => ({ ...f, staffName: staffLabel(f.staffName, staffRows) })));
}

const STORE_IDS = STORES.map((s) => s.id);
const CHIP_IDS = new Set(FEEDBACK_CHIPS.map((c) => c.id));
const meshOrNull = (v: unknown) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? roundMesh(n) : null;
};

export async function POST(req: Request) {
  const g = await guard();
  if ('error' in g) return g.error;

  const body = await req.json();
  const staffName = String(body.staffName ?? '').trim();
  const store = body.store as StoreId;
  const brewType: BrewType = body.brewType === 'hot' ? 'hot' : 'ice';
  if (!staffName) return NextResponse.json({ error: '이름을 골라 주세요.' }, { status: 400 });
  if (!STORE_IDS.includes(store)) return NextResponse.json({ error: '지점 정보가 없습니다.' }, { status: 400 });
  if (!body.beanKey || !body.bean || !body.recipeVersion) {
    return NextResponse.json({ error: '레시피 정보가 없습니다.' }, { status: 400 });
  }
  const picked = Array.isArray(body.issues)
    ? Array.from(new Set((body.issues as unknown[]).map(String))).filter((id) => CHIP_IDS.has(id))
    : [];
  // '좋음'은 단독 — 다른 칩과 함께 오면 '좋음'을 버린다
  const issues = picked.length > 1 ? picked.filter((id) => id !== GOOD_CHIP) : picked;

  const rec: BrewFeedback = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    createdBy: g.user.email ?? '',
    staffName,
    store,
    beanKey: String(body.beanKey),
    bean: String(body.bean),
    brewType,
    recipeVersion: String(body.recipeVersion),
    issues,
    baseMesh: meshOrNull(body.baseMesh),
    nextMesh: meshOrNull(body.baseMesh) == null ? null : meshOrNull(body.nextMesh),
    memo: String(body.memo ?? '').trim().slice(0, 200),
  };
  await brewFeedbackRecords.writeOne(rec);
  const storeLabel = STORES.find((s) => s.id === store)?.short ?? store;
  await logActivity(g.supabase, g.user, '가든서비스 추출 평가', `${rec.bean} ${brewType.toUpperCase()} · ${storeLabel} · ${staffName}`);
  return NextResponse.json(rec);
}
