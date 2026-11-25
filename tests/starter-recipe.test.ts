import { describe, expect, it } from 'vitest';
import type { DripRecipe } from '@/lib/types';
import { starterRecipe } from '@/lib/garden/starter-recipe';

const hot = (over: Partial<DripRecipe>): DripRecipe =>
  ({
    beanKey: 'a', bean: 'A', brewType: 'hot', doseG: 17, waterG: 230, tempC: 93, grind: '', grindMesh: 7.5, totalTime: '2:50', notes: '', updatedAt: '2026-11-01',
    pours: [{ water: 35, label: '뜸' }, { water: 65, label: '1차' }, { water: 65, label: '2차' }, { water: 65, label: '3차' }],
    ...over,
  }) as DripRecipe;

describe('레시피 보드 새 레시피 시작값', () => {
  it('레시피가 하나도 없으면 매장 기준 프리셋', () => {
    const r = starterRecipe({ recipes: [], grinderProfiles: {}, beanKey: 'n', bean: 'N', brewType: 'hot', store: 'yangjae' });
    expect(r).toMatchObject({ beanKey: 'n', bean: 'N', brewType: 'hot', doseG: 18, waterG: 230, tempC: 92, grindMesh: 7, totalTime: '3:30', presetId: 'house-hot', updatedAt: '' });
    expect(r.store).toBeUndefined();
    expect(r.pours?.map((p) => p.water)).toEqual([35, 65, 65, 65]);
  });

  it('같은 지점·타입 최근 레시피가 있으면 그 최빈값', () => {
    const recipes = [hot({ beanKey: 'a' }), hot({ beanKey: 'b' }), hot({ beanKey: 'c', doseG: 18, grindMesh: 7 })];
    const r = starterRecipe({ recipes, grinderProfiles: {}, beanKey: 'n', bean: 'N', brewType: 'hot', store: 'yangjae' });
    expect(r).toMatchObject({ doseG: 17, tempC: 93, grindMesh: 7.5, totalTime: '2:50', presetId: null });
    // ICE 레시피는 없으니 ICE 는 프리셋
    expect(starterRecipe({ recipes, grinderProfiles: {}, beanKey: 'n', bean: 'N', brewType: 'ice', store: 'yangjae' })).toMatchObject({ doseG: 20, waterG: 190, presetId: 'house-ice' });
  });

  it('판교 레시피가 없고 환산도 안 되면 양재천 최근값 + 프리셋 분쇄도, 지점은 판교', () => {
    const r = starterRecipe({ recipes: [hot({})], grinderProfiles: {}, beanKey: 'n', bean: 'N', brewType: 'hot', store: 'pangyo' });
    expect(r).toMatchObject({ store: 'pangyo', doseG: 17, grindMesh: 7 });
  });
});
