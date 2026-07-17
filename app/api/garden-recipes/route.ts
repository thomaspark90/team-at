import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { DripRecipe, DripRecipeSnapshot, RecipeStore } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { notifyGardenEvent } from '@/lib/notify';
import { readGardenTopics } from '@/lib/garden-notify-topics-server';

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
  // 최초 등록 시점 보존 — 구 기록(createdAt 없음)은 이력 최초 저장 시각으로 백필
  recipe.createdAt = prev
    ? prev.createdAt ??
      (prev.history?.length ? prev.history[prev.history.length - 1].updatedAt : prev.updatedAt)
    : recipe.updatedAt;
  // 이전 버전을 이력으로 보관 (최신순, 최대 20개) — 판교 보정 이력은 스냅샷에서 제외
  if (prev) {
    const { beanKey: _k, brewType: _t, bean: _b, history: _h, pangyoMeshHistory: _ph, ...snap } = prev;
    recipe.history = [snap as DripRecipeSnapshot, ...(prev.history ?? [])].slice(0, 20);
  } else {
    recipe.history = [];
  }
  // 판교 수동 보정 유지 — 단, 양재천 기준 분쇄도가 바뀌면 보정이 낡은 값이 되므로 자동값으로 복귀
  if (prev) {
    const baseChanged = (prev.grindMesh ?? null) !== (recipe.grindMesh ?? null);
    if (baseChanged && prev.pangyoMesh != null) {
      recipe.pangyoMesh = null;
      recipe.pangyoMeshHistory = [
        {
          mesh: null,
          updatedAt: recipe.updatedAt,
          updatedBy: user.email ?? '',
          reason: `양재천 분쇄도 변경(${prev.grindMesh ?? '—'} → ${recipe.grindMesh ?? '—'})으로 자동값 복귀`,
        },
        ...(prev.pangyoMeshHistory ?? []),
      ].slice(0, 20);
    } else {
      recipe.pangyoMesh = prev.pangyoMesh ?? null;
      recipe.pangyoMeshHistory = prev.pangyoMeshHistory;
    }
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

  // 토픽 담당자 알림 (신규/수정) — 담당자 미지정 토픽은 발송 없음(옵트인). 실패해도 저장은 유지.
  try {
    const topics = await readGardenTopics();
    const emails = isNew ? topics.recipeNew : topics.recipeEdit;
    if (emails.length > 0) {
      const by = (user.email ?? '').split('@')[0];
      const summary =
        `${recipe.bean} ${brewType.toUpperCase()}` +
        (recipe.doseG != null && recipe.waterG != null ? ` · ${recipe.doseG}g : ${recipe.waterG}ml` : '') +
        (recipe.grindMesh != null ? ` · 분쇄도 ${recipe.grindMesh}` : '');
      await notifyGardenEvent(supabase, {
        emails,
        subject: `[레시피 ${isNew ? '등록' : '수정'}] ${recipe.bean} ${brewType.toUpperCase()}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${isNew ? '신규 레시피가 등록됐어요' : '레시피가 수정됐어요'}</strong></p>
          <p>${summary}</p>
          ${by ? `<p>저장: ${by}</p>` : ''}
          <p><a href="https://team-at-apps.vercel.app/garden/recipes">필터 레시피 열기 →</a></p>
        </div>`,
        push: {
          title: `레시피 ${isNew ? '등록' : '수정'} · ${recipe.bean}`,
          body: `${summary}${by ? ` — ${by}` : ''}`,
          url: '/garden/recipes',
        },
      });
    }
  } catch (e) {
    console.error('레시피 알림 실패:', e);
  }
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
