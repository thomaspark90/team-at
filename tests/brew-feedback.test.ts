import { describe, expect, it } from 'vitest';
import { meshDeltaText, suggestMesh, summarize } from '@/lib/garden/brew-feedback';
import type { BrewFeedback } from '@/lib/types';

describe('추출 평가 — 분쇄도 제안', () => {
  it('덜 추출 칩만 → 0.1 곱게', () => {
    expect(suggestMesh(['sour', 'watery'], 7.1).mesh).toBe(7);
  });
  it('과다 추출 칩만 → 0.1 굵게', () => {
    expect(suggestMesh(['bitter'], 7.1).mesh).toBe(7.2);
  });
  it('양쪽 섞이면 제안 없음', () => {
    expect(suggestMesh(['sour', 'bitter'], 7.1).mesh).toBeNull();
  });
  it('칩 없으면 그대로', () => {
    expect(suggestMesh([], 7.1).mesh).toBe(7.1);
  });
  it('기준 분쇄도 없으면 제안 없음', () => {
    expect(suggestMesh(['sour'], null).mesh).toBeNull();
  });
});

describe('추출 평가 — 표기·집계', () => {
  it('변화량 표기', () => {
    expect(meshDeltaText(7.1, 7.0)).toBe('−0.1 · 더 곱게');
    expect(meshDeltaText(7.1, 7.3)).toBe('+0.2 · 더 굵게');
    expect(meshDeltaText(7.1, 7.1)).toBe('그대로');
  });
  it('집계 — 제안 분포·칩 빈도·평균', () => {
    const base = { store: 'yangjae', beanKey: 'b', bean: 'B', brewType: 'ice', recipeVersion: 'v', memo: '', staffName: 'a', createdAt: '' } as const;
    const list: BrewFeedback[] = [
      { ...base, id: '1', issues: ['sour'], baseMesh: 7.1, nextMesh: 7.0 },
      { ...base, id: '2', issues: ['sour', 'watery'], baseMesh: 7.1, nextMesh: 7.0 },
      { ...base, id: '3', issues: [], baseMesh: 7.1, nextMesh: 7.1 },
    ];
    const s = summarize(list);
    expect(s.count).toBe(3);
    expect(s.deltas[0]).toEqual(['−0.1 · 더 곱게', 2]);
    expect(s.chips[0]).toEqual(['sour', 2]);
    expect(s.avgMesh).toBeCloseTo(7.033, 2);
  });
});

import { recipeChanges, recipesForStore } from '@/lib/garden/recipe-store';
import type { DripRecipe } from '@/lib/types';

describe('레시피 지점 분리', () => {
  const base = { bean: 'B', doseG: 20, waterG: 190, tempC: 92, grind: '', totalTime: '3:30', notes: '', updatedAt: '' };
  const yj = { ...base, beanKey: 'b', brewType: 'ice', grindMesh: 7.1 } as DripRecipe;
  const pgHot = { ...base, beanKey: 'b', brewType: 'hot', store: 'pangyo', grindMesh: 8.0 } as DripRecipe;
  it('양재천 화면은 store 없는 기존 기록만', () => {
    expect(recipesForStore([yj, pgHot], 'yangjae').map((x) => x.recipe)).toEqual([yj]);
  });
  it('판교 화면은 판교 레시피 + 없는 슬롯은 양재천 대체', () => {
    const v = recipesForStore([yj, pgHot], 'pangyo');
    expect(v).toContainEqual({ recipe: pgHot, fallback: false });
    expect(v).toContainEqual({ recipe: yj, fallback: true });
  });
  it('이력 변경점', () => {
    const a = { doseG: 20, waterG: 190, tempC: 92, grindMesh: 7.1, totalTime: '3:30', pours: [{ water: 35, label: '뜸' }, { water: 50 }] };
    const b = { ...a, grindMesh: 7.0, pours: [{ water: 35, label: '뜸' }, { water: 55 }], waterG: 195 };
    expect(recipeChanges(a, b)).toEqual(['분쇄도 7.1→7.0', '1차 50→55g', '추출량 190→195g']);
  });
});
