import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { DripRecipe, DripRecipeSnapshot, RecipeStore } from '@/lib/types';
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

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const store = await readStore();
  return NextResponse.json(store.recipes);
}

const brewTypeOf = (v: unknown) => (v === 'hot' ? 'hot' : 'ice') as 'ice' | 'hot';

// 레시피 저장(업서트): beanKey+brewType 기준 — { beanKey, brewType, bean, doseG, waterG, pours, tempC, grind, totalTime, notes }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  if (!body.beanKey || !body.bean) {
    return NextResponse.json({ error: '원두 정보가 없습니다.' }, { status: 400 });
  }

  const store = await readStore();
  const brewType = brewTypeOf(body.brewType);
  const recipe: DripRecipe = {
    beanKey: body.beanKey,
    brewType,
    bean: body.bean,
    doseG: body.doseG ?? null,
    waterG: body.waterG ?? null,
    pours: Array.isArray(body.pours) && body.pours.length > 0 ? body.pours : null,
    tempC: body.tempC ?? null,
    grind: body.grind ?? '',
    grindMesh: body.grindMesh ?? null,
    totalTime: body.totalTime ?? '',
    notes: body.notes ?? '',
    presetId: body.presetId ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email ?? '',
  };
  const same = (r: DripRecipe) => r.beanKey === recipe.beanKey && brewTypeOf(r.brewType) === brewType;
  const prev = store.recipes.find(same);
  const isNew = !prev;
  // 이전 버전을 이력으로 보관 (최신순, 최대 20개)
  if (prev) {
    const { beanKey: _k, brewType: _t, bean: _b, history: _h, ...snap } = prev;
    recipe.history = [snap as DripRecipeSnapshot, ...(prev.history ?? [])].slice(0, 20);
  } else {
    recipe.history = [];
  }
  store.recipes = [...store.recipes.filter((r) => !same(r)), recipe];
  await writeStore(store);
  await logActivity(
    supabase,
    user,
    isNew ? '가든서비스 레시피 등록' : '가든서비스 레시피 수정',
    `${recipe.bean} ${brewType.toUpperCase()}` +
      (recipe.doseG != null && recipe.waterG != null
        ? ` · ${recipe.doseG}g : ${recipe.waterG}ml`
        : '')
  );
  return NextResponse.json(recipe);
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { beanKey, brewType: bt } = await req.json();
  const brewType = brewTypeOf(bt);
  const store = await readStore();
  const same = (r: DripRecipe) => r.beanKey === beanKey && brewTypeOf(r.brewType) === brewType;
  const removed = store.recipes.find(same);
  store.recipes = store.recipes.filter((r) => !same(r));
  await writeStore(store);
  await logActivity(
    supabase,
    user,
    '가든서비스 레시피 삭제',
    removed ? `${removed.bean} ${brewType.toUpperCase()}` : null
  );
  return NextResponse.json({ ok: true });
}
