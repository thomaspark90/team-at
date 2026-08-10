import { APP_URL } from '@/lib/app-url';
import { NextResponse } from 'next/server';
import type { DripRecipe, DripRecipeSnapshot } from '@/lib/types';
import { dripRecipeRecords, purchaseRecords, type StoredDripRecipe } from '@/lib/blob-records';
import { normalize } from '@/lib/pricing';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { notifyGardenEvent } from '@/lib/notify';
import { readGardenTopics } from '@/lib/garden-notify-topics-server';
import { requireGardenTab } from '@/lib/access/guard';

// 기록별 blob 저장(lib/blob-records) — 레시피 1건 = 파일 1개라 서로 다른 레시피를
// 동시에 저장해도 유실이 없다. (같은 레시피 동시 수정은 여전히 마지막 저장이 이긴다)

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, ['recipes', 'dashboard', 'recommended', 'beancard']);
    if (denied) return denied;
  }

  return NextResponse.json(await dripRecipeRecords.readAll());
}

const brewTypeOf = (v: unknown) => (v === 'hot' ? 'hot' : 'ice') as 'ice' | 'hot';

// 레시피 저장(업서트): beanKey+brewType 기준 — { beanKey, brewType, bean, doseG, waterG, pours, tempC, grind, totalTime, notes }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, ['recipes', 'dashboard']);
    if (denied) return denied;
  }

  const body = await req.json();
  if (!body.beanKey || !body.bean) {
    return NextResponse.json({ error: '원두 정보가 없습니다.' }, { status: 400 });
  }

  // 분쇄도(양재천 EK43 다이얼) 서버 검증 — pangyo-mesh 라우트와 동일 정책(4.0~13.0, 0.1 단위).
  // 구 기록 텍스트 파싱 오염('EK43'의 43 등) 같은 범위 밖 값이 영속되는 것을 막는다.
  let grindMesh: number | null = null;
  if (body.grindMesh != null && body.grindMesh !== '') {
    const m = Number(body.grindMesh);
    if (!Number.isFinite(m) || m < 4 || m > 13) {
      return NextResponse.json({ error: '분쇄도(mesh)는 4.0~13.0 범위의 숫자여야 합니다.' }, { status: 400 });
    }
    grindMesh = Math.round(m * 10) / 10;
  }

  const all = await dripRecipeRecords.readAll();
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
    grindMesh,
    totalTime: body.totalTime ?? '',
    notes: body.notes ?? '',
    presetId: body.presetId ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email ?? '',
  };
  const same = (r: DripRecipe) => r.beanKey === recipe.beanKey && brewTypeOf(r.brewType) === brewType;
  const prev = all.find(same);
  const isNew = !prev;
  recipe.id = prev?.id ?? crypto.randomUUID(); // 업서트 — 기존 기록의 id 를 이어받아 같은 파일에 덮어쓴다
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
          baseMesh: recipe.grindMesh ?? null,
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
  await dripRecipeRecords.writeOne(recipe as StoredDripRecipe);

  // 담당자가 다시 레시피를 저장했으니 되돌리기 요청은 처리된 것으로 간주 — 걸려있던 원두만 클리어
  try {
    const flagged = (await purchaseRecords.readAll()).filter(
      (p) => normalize(p.bean) === recipe.beanKey && p.recipeReview
    );
    for (const p of flagged) {
      p.recipeReview = undefined;
      await purchaseRecords.writeOne(p);
    }
  } catch (e) {
    console.error('recipeReview 클리어 실패:', e);
  }

  await logActivity(
    supabase,
    user,
    isNew ? '가든서비스 레시피 등록' : '가든서비스 레시피 수정',
    `${recipe.bean} ${brewType.toUpperCase()}` +
      (recipe.doseG != null && recipe.waterG != null
        ? ` · ${recipe.doseG}g : ${recipe.waterG}g`
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
        (recipe.doseG != null && recipe.waterG != null ? ` · ${recipe.doseG}g : ${recipe.waterG}g` : '') +
        (recipe.grindMesh != null ? ` · 분쇄도 ${recipe.grindMesh}` : '');
      await notifyGardenEvent(supabase, {
        emails,
        subject: `[레시피 ${isNew ? '등록' : '수정'}] ${recipe.bean} ${brewType.toUpperCase()}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${isNew ? '신규 레시피가 등록됐어요' : '레시피가 수정됐어요'}</strong></p>
          <p>${summary}</p>
          ${by ? `<p>저장: ${by}</p>` : ''}
          <p><a href="${APP_URL}/garden/recipes">필터 레시피 열기 →</a></p>
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
  {
    const denied = await requireGardenTab(supabase, user, ['recipes', 'dashboard']);
    if (denied) return denied;
  }

  const { beanKey, brewType: bt } = await req.json();
  const brewType = brewTypeOf(bt);
  const same = (r: DripRecipe) => r.beanKey === beanKey && brewTypeOf(r.brewType) === brewType;
  const removed = (await dripRecipeRecords.readAll()).find(same);
  if (removed) await dripRecipeRecords.deleteOne(removed.id);
  await logActivity(
    supabase,
    user,
    '가든서비스 레시피 삭제',
    removed ? `${removed.bean} ${brewType.toUpperCase()}` : null
  );
  return NextResponse.json({ ok: true });
}
