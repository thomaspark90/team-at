import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { DripRecipe, RecipeStore } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';

const DATA_PATH = 'data/garden-recipes.json';

async function readStore(): Promise<RecipeStore> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { recipes: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as RecipeStore;
  } catch {
    return { recipes: [] };
  }
}

async function writeStore(store: RecipeStore) {
  await put(DATA_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

const brewTypeOf = (v: unknown) => (v === 'hot' ? 'hot' : 'ice') as 'ice' | 'hot';

// 판교 EK43 수동 보정 저장: { beanKey, brewType, mesh: number|null }
// mesh=null 이면 산식 자동값으로 복귀. 변경은 pangyoMeshHistory에 기록(최신순, 최대 20).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const beanKey = String(body.beanKey ?? '');
  const brewType = brewTypeOf(body.brewType);
  const mesh = body.mesh === null ? null : Number(body.mesh);
  if (mesh !== null && !(Number.isFinite(mesh) && mesh >= 4 && mesh <= 13)) {
    return NextResponse.json({ error: '판교 다이얼은 4.0~13.0 사이여야 합니다.' }, { status: 400 });
  }

  const store = await readStore();
  const recipe = store.recipes.find(
    (r: DripRecipe) => r.beanKey === beanKey && brewTypeOf(r.brewType) === brewType
  );
  if (!recipe) return NextResponse.json({ error: '레시피를 찾을 수 없습니다.' }, { status: 404 });

  const rounded = mesh === null ? null : Math.round(mesh * 10) / 10;
  recipe.pangyoMesh = rounded;
  recipe.pangyoMeshHistory = [
    {
      mesh: rounded,
      baseMesh: recipe.grindMesh ?? null, // 보정 당시 양재천 기준값 — Δ 복원용
      updatedAt: new Date().toISOString(),
      updatedBy: user.email ?? '',
    },
    ...(recipe.pangyoMeshHistory ?? []),
  ].slice(0, 20);
  await writeStore(store);

  await logActivity(
    supabase,
    user,
    '가든서비스 판교 분쇄도 보정',
    `${recipe.bean} ${brewType.toUpperCase()} · ${rounded === null ? '산식 자동값 복귀' : `판교 ${rounded.toFixed(1)}`}`
  );
  return NextResponse.json(recipe);
}
