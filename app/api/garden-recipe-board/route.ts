import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { BeanMetaStore, GardenOptions } from '@/lib/types';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { alignmentRecords, brewFeedbackRecords, dripRecipeRecords, purchaseRecords } from '@/lib/blob-records';
import { dropStaleProfiles } from '@/lib/grinder-alignments';
import { normalize } from '@/lib/pricing';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';

// 태블릿 레시피 보드 한 방 조회 — 화면이 쓰던 7개 API(레시피·원두·발주·그라인더·얼라인·추출 평가·스탭 명단)를
// 요청 하나로 묶는다. 로그인·권한 확인 1회 + 서버 안에서 blob 병렬 읽기라 첫 로딩이 짧아진다.
// 각 원본 API(/api/garden-recipes 등)는 다른 화면이 그대로 쓴다 — 여기는 읽기 전용 묶음.

async function readJson<T>(path: string): Promise<T | null> {
  const res = await get(path, { access: 'private', useCache: false });
  if (!res) return null;
  try {
    return JSON.parse(await new Response(res.stream).text()) as T;
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
  const denied = await requireGardenTab(supabase, user, 'recipes');
  if (denied) return denied;

  const [recipes, beans, purchases, grinders, alignments, feedback, options] = await Promise.all([
    dripRecipeRecords.readAll(),
    readJson<BeanMetaStore>('data/garden-beans.json'),
    purchaseRecords.readAll(),
    readJson<{ profiles: GrinderProfiles }>('data/garden-grinders.json'),
    alignmentRecords.readAll(),
    brewFeedbackRecords.readAll(),
    readJson<GardenOptions>('data/garden-options.json'),
  ]);

  // 발주는 '원두별 마지막 발주 시각'만 필요(보관 후 재발주 자동 해제 판정) — 전체 기록은 내리지 않는다
  const latestPurchaseAt: Record<string, string> = {};
  const purchaseBean: Record<string, string> = {}; // 원두별 최근 발주 표기명 — 레시피 준비 중 목록용
  for (const p of purchases) {
    const k = normalize(p.bean);
    if (!latestPurchaseAt[k] || p.createdAt.localeCompare(latestPurchaseAt[k]) > 0) {
      latestPurchaseAt[k] = p.createdAt;
      purchaseBean[k] = p.bean;
    }
  }
  // 발주 때 입력한 테이스팅 노트 — 원두별 가장 최근 입력분(레시피 노트가 없을 때 화면이 대신 쓴다)
  const purchaseTasting: Record<string, string> = {};
  const tastingAt: Record<string, string> = {};
  for (const p of purchases) {
    const t = p.tastingNotes?.trim();
    if (!t) continue;
    const k = normalize(p.bean);
    if (!tastingAt[k] || p.createdAt.localeCompare(tastingAt[k]) > 0) {
      tastingAt[k] = p.createdAt;
      purchaseTasting[k] = t;
    }
  }

  return NextResponse.json({
    recipes,
    beans: beans?.beans ?? [],
    latestPurchaseAt,
    purchaseBean,
    purchaseTasting,
    grinderProfiles: dropStaleProfiles(grinders?.profiles ?? {}, alignments),
    alignments,
    feedback,
    staffNames: options?.staffNames ?? [],
  });
}
