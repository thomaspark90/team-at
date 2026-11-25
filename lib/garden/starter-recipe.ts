import type { BrewType, DripRecipe, StoreId } from '@/lib/types';
import { applyPreset, presetById } from '@/lib/drip-presets';
import { convertDial, type GrinderProfiles } from '@/lib/grinder-calibration';
import { recentDefaults } from '@/lib/garden/recent-defaults';

// 새 레시피의 시작값 — 레시피 보드에서 '준비 중' 원두(또는 한쪽 타입만 있는 원두)의 레시피를 처음 만들 때 쓴다 (2026-11-25).
// 규칙은 필터커피 화면의 새 레시피 기본값과 같다: 같은 지점·타입 최근 20개 레시피의 최빈값, 없으면 매장 기준 프리셋.
// 판교 레시피가 아직 하나도 없으면 양재천 최근값을 쓰되 분쇄도는 판교 다이얼로 환산(환산 불가면 프리셋 값).
// updatedAt 이 빈 문자열이면 '아직 저장 전'이라는 뜻이다.

export const housePresetId = (bt: BrewType) => (bt === 'ice' ? 'house-ice' : 'house-hot');

export function starterRecipe({
  recipes,
  grinderProfiles,
  beanKey,
  bean,
  brewType,
  store,
}: {
  recipes: DripRecipe[];
  grinderProfiles: GrinderProfiles;
  beanKey: string;
  bean: string;
  brewType: BrewType;
  store: StoreId;
}): DripRecipe {
  const presetId = housePresetId(brewType);
  const preset = applyPreset(presetById(presetId)!);
  let recent = recentDefaults(recipes, brewType, store);
  let mesh = recent?.grindMesh ?? null;
  if (!recent && store === 'pangyo') {
    recent = recentDefaults(recipes, brewType, 'yangjae');
    mesh = recent?.grindMesh != null ? convertDial(grinderProfiles, 'yangjae', 'pangyo', recent.grindMesh) : null;
  }
  const pours = recent?.pours ?? preset.pours;
  const waterG = pours.reduce((a, s) => a + s.water, 0);
  const grindMesh = mesh ?? preset.grindMesh ?? null;
  return {
    beanKey,
    bean,
    brewType,
    ...(store === 'pangyo' ? { store } : {}),
    doseG: recent?.doseG ?? preset.doseG,
    waterG: waterG > 0 ? waterG : null,
    pours,
    bypassG: null,
    tempC: recent?.tempC ?? preset.tempC ?? null,
    grind: '',
    grindMesh: grindMesh != null ? Math.round(grindMesh * 10) / 10 : null,
    totalTime: recent?.totalTime ?? preset.totalTime,
    notes: '',
    presetId: recent ? null : presetId,
    updatedAt: '',
  };
}
