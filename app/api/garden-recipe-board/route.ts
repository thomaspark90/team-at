import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { BeanMetaStore } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { alignmentRecords, brewFeedbackRecords, dripRecipeRecords, purchaseRecords } from '@/lib/blob-records';
import { dropStaleProfiles } from '@/lib/grinder-alignments';
import { normalize } from '@/lib/pricing';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import { serviceClient } from '@/lib/supabase/service';
import { brewerNames } from '@/lib/garden/brewers';
import { brewerStaffRows, readBrewerSaved } from '@/lib/garden/brewers-server';
import { staffLabel } from '@/lib/staff/names';

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

  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  const [recipes, beans, purchases, grinders, alignments, feedback, staffRows, brewerSaved] = await Promise.all([
    dripRecipeRecords.readAll(),
    readJson<BeanMetaStore>('data/garden-beans.json'),
    purchaseRecords.readAll(),
    readJson<{ profiles: GrinderProfiles }>('data/garden-grinders.json'),
    alignmentRecords.readAll(),
    brewFeedbackRecords.readAll(),
    brewerStaffRows(svc),
    readBrewerSaved(),
  ]);

  // 발주는 '원두별 마지막 발주 시각'만 필요(보관 후 재발주 자동 해제 판정) — 전체 기록은 내리지 않는다
  const latestPurchaseAt: Record<string, string> = {};
  const purchaseBean: Record<string, string> = {}; // 원두별 최근 발주 표기명 — 레시피 없는 원두(대기 중) 목록용
  // 원두별 최근 발주의 로스팅일 재료 — 보드가 lib/garden/roast 의 roastInfo 로 「로스팅 MM.DD +NN」을 계산한다(날수는 볼 때마다 다시 센다)
  const purchaseRoast: Record<string, { roastDate?: string; orderDate?: string; createdAt: string }> = {};
  for (const p of purchases) {
    const k = normalize(p.bean);
    if (!latestPurchaseAt[k] || p.createdAt.localeCompare(latestPurchaseAt[k]) > 0) {
      latestPurchaseAt[k] = p.createdAt;
      purchaseBean[k] = p.bean;
      purchaseRoast[k] = { roastDate: p.roastDate, orderDate: p.orderDate, createdAt: p.createdAt };
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

  const staffNamesByStore = Object.fromEntries(STORES.map((s) => [s.id, brewerNames(staffRows, brewerSaved, s.id)]));

  return NextResponse.json({
    recipes,
    beans: beans?.beans ?? [],
    latestPurchaseAt,
    purchaseBean,
    purchaseRoast,
    purchaseTasting,
    grinderProfiles: dropStaleProfiles(grinders?.profiles ?? {}, alignments),
    alignments,
    feedback: feedback.map((f) => ({ ...f, staffName: staffLabel(f.staffName, staffRows) })),
    // 필터커피 내리는 사람 — 지점별로, 그 지점에서 근무하는 사람 중 설정에서 켠 사람(lib/garden/brewers)
    staffNamesByStore,
    // 지점 구분이 없던 옛 화면(새로 고침 전에 열려 있던 태블릿)용 — 두 지점 합친 명단. 새 화면은 쓰지 않는다
    staffNames: Array.from(new Set(Object.values(staffNamesByStore).flat())).sort((a, b) => a.localeCompare(b, 'ko')),
  });
}
