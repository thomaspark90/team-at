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

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const store = await readStore();
  return NextResponse.json(store.recipes);
}

// 레시피 저장(업서트): beanKey 기준 — { beanKey, bean, doseG, waterG, tempC, grind, totalTime, notes }
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
  const recipe: DripRecipe = {
    beanKey: body.beanKey,
    bean: body.bean,
    doseG: body.doseG ?? null,
    waterG: body.waterG ?? null,
    pours: Array.isArray(body.pours) && body.pours.length > 0 ? body.pours : null,
    tempC: body.tempC ?? null,
    grind: body.grind ?? '',
    totalTime: body.totalTime ?? '',
    notes: body.notes ?? '',
    presetId: body.presetId ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email ?? '',
  };
  const isNew = !store.recipes.some((r) => r.beanKey === recipe.beanKey);
  store.recipes = [...store.recipes.filter((r) => r.beanKey !== recipe.beanKey), recipe];
  await writeStore(store);
  await logActivity(
    supabase,
    user,
    isNew ? '가든서비스 레시피 등록' : '가든서비스 레시피 수정',
    `${recipe.bean}` +
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

  const { beanKey } = await req.json();
  const store = await readStore();
  const removed = store.recipes.find((r) => r.beanKey === beanKey);
  store.recipes = store.recipes.filter((r) => r.beanKey !== beanKey);
  await writeStore(store);
  await logActivity(supabase, user, '가든서비스 레시피 삭제', removed ? removed.bean : null);
  return NextResponse.json({ ok: true });
}
