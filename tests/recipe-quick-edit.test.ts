import { describe, expect, it } from 'vitest';
import type { DripRecipe } from '@/lib/types';
import { applyDraft, bump, canEditWater, draftOf, feedbackActions, isApplied, parseTime, quickChanges } from '@/lib/garden/recipe-quick-edit';

const recipe = {
  beanKey: 'b', bean: 'B', brewType: 'hot', doseG: 18, waterG: 230, tempC: 91, grind: '', grindMesh: 7.6, totalTime: '3:00', notes: '', updatedAt: 'v1',
  pours: [{ water: 35, label: '뜸' }, { water: 70, label: '1차' }, { water: 60, label: '2차' }, { water: 65, label: '3차' }],
} as DripRecipe;
const orig = draftOf(recipe, 7.6);

describe('레시피 보드 바로 수정', () => {
  it('시작값 — 시간은 초, 횟수는 뜸 제외', () => {
    expect(orig).toEqual({ mesh: 7.6, waterG: 230, doseG: 18, tempC: 91, timeSec: 180, pourCount: 3 });
    expect(parseTime('2:5')).toBeNull();
  });

  it('조절 단위 — 분쇄도 0.1 · 추출량 5g · 시간 10초', () => {
    expect(bump(orig, orig, 'mesh', -1).mesh).toBe(7.5);
    expect(bump(orig, orig, 'waterG', 1).waterG).toBe(235);
    expect(bump(orig, orig, 'timeSec', 1).timeSec).toBe(190);
    expect(bump(orig, orig, 'tempC', -1).tempC).toBe(91); // 범위 하한
  });

  it('아무것도 안 바꾸면 차수별 물량·시간 표기를 그대로 둔다', () => {
    const a = applyDraft(recipe, orig, orig);
    expect(a.pours).toBe(recipe.pours);
    expect(a.totalTime).toBe('3:00');
    expect(quickChanges(orig, orig)).toEqual([]);
  });

  it('추출량을 바꾸면 뜸은 두고 나머지를 5g 단위로 다시 나눈다', () => {
    const d = bump(bump(orig, orig, 'waterG', -1), orig, 'waterG', -1); // 220g
    const a = applyDraft(recipe, d, orig);
    expect(a.pours?.map((p) => p.water)).toEqual([35, 65, 60, 60]);
    expect(a.waterG).toBe(220);
    expect(quickChanges(orig, d)).toEqual(['추출량 230g → 220g']);
  });

  it('횟수를 2번으로 — 총량 유지', () => {
    const a = applyDraft(recipe, { ...orig, pourCount: 2 }, orig);
    expect(a.pours?.map((p) => p.water)).toEqual([35, 100, 95]);
    expect(a.waterG).toBe(230);
  });

  it('의견 → 적용 버튼: 다음 분쇄도, 진함 = 물 +10g, 연함 = 물 −10g', () => {
    const acts = feedbackActions({ issues: ['sour', 'weak'], nextMesh: 7.5 }, orig, true);
    expect(acts.map((a) => a.label)).toEqual(['분쇄도 7.5 적용', '물 −10g 적용']);
    expect(isApplied({ ...orig, mesh: 7.5 }, acts[0].patch)).toBe(true);
    expect(feedbackActions({ issues: ['good'], nextMesh: 7.6 }, orig, true)).toEqual([]);
    expect(feedbackActions({ issues: ['strong'], nextMesh: null }, orig, true)[0].patch).toEqual({ waterG: 240 });
  });

  it('뜸으로 시작하지 않는 구 기록은 추출량을 못 바꾼다', () => {
    expect(canEditWater({ ...recipe, pours: [{ water: 230, label: '총 물량' }] })).toBe(false);
    expect(canEditWater({ ...recipe, pours: null })).toBe(true);
  });
});
