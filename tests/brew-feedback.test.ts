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

import { flavorColors, flavorGradient } from '@/lib/flavor-colors';

describe('헤더 색 — 앞 노트 3개만', () => {
  it('4번째 이후 노트 색은 빠진다', () => {
    const g = flavorGradient('백합, 사과잼, 패션프루츠, 화이트와인, 홍차, 졸인설탕')!;
    expect(g).toContain('#E17BA4'); // 백합 → 플로럴
    expect(g).not.toContain('#8E3B54'); // 화이트와인(4번째) 제외
    expect(g).not.toContain('#B4703A'); // 홍차(5번째) 제외
  });
  it('크렌베리 표기도 레드베리', () => {
    expect(flavorColors('크렌베리')).toEqual(['#C94057']);
  });
});

describe('헤더 색 B안 — 대표색 + 포인트', () => {
  it('맨 아래 레이어는 1번째 노트 색 한 장', () => {
    const g = flavorGradient('오렌지, 크렌베리, 사과')!;
    expect(g).toContain('linear-gradient(120deg, #F5A6238C 0%, hsl('); // 대표색 → 이웃 색 그라데이션(단색 아님)
    expect(g.match(/radial-gradient/g)?.length).toBe(2);
  });
  it('백도는 복숭아 계열', () => {
    expect(flavorColors('백도')).toEqual(['#F49E6D']);
  });
});

import { resolveTasting } from '@/lib/garden/bean-groups';
import type { BeanMeta } from '@/lib/types';

describe('원두 노트 — 레시피 편집 > 발주 노트', () => {
  const m = (x: Partial<BeanMeta>) => ({ beanKey: 'b', bean: 'B', tasting: '', updatedAt: '', ...x }) as BeanMeta;
  it('편집한 적 없으면 발주 노트', () => expect(resolveTasting(undefined, '자두, 홍차')).toBe('자두, 홍차'));
  it('편집한 노트가 우선', () => expect(resolveTasting(m({ tasting: '자두', tastingEdited: true }), '자두, 홍차')).toBe('자두'));
  it('편집으로 모두 지우면 빈 값 유지', () => expect(resolveTasting(m({ tasting: '', tastingEdited: true }), '자두')).toBe(''));
  it('구 기록(플래그 없음)의 노트도 우선', () => expect(resolveTasting(m({ tasting: '백합' }), '자두')).toBe('백합'));
});

describe('헤더 색 — 복합 노트·단색 방지', () => {
  it('오렌지 블라썸=꽃, 레몬그라스=허브, 라임=시트러스', () => {
    expect(flavorColors('오렌지 블라썸, 레몬그라스, 라임')).toEqual(['#E17BA4', '#6B9E5F', '#F5A623']);
  });
  it('청포도는 포도(퍼플)가 아니라 청포도(그린)', () => {
    expect(flavorColors('청포도')).toEqual(['#A3C24B']);
  });
  it('색이 하나여도 단색이 아닌 그라데이션', () => {
    const g = flavorGradient('자두')!;
    expect(g.startsWith('linear-gradient(120deg, #7C4D8F8C 0%, hsl(')).toBe(true);
  });
});

import { recentDefaults } from '@/lib/garden/recent-defaults';

describe('새 레시피 기본값 — 최근 20개 최빈값', () => {
  const mk = (i: number, x: Partial<DripRecipe>) =>
    ({ beanKey: `b${i}`, bean: 'B', brewType: 'ice', grind: '', notes: '', totalTime: '3:00', updatedAt: `2026-10-${String(10 + i).padStart(2, '0')}`, doseG: 20, waterG: 190, tempC: 92, grindMesh: 7.1, pours: [{ water: 35 }, { water: 55 }, { water: 55 }, { water: 45 }], ...x }) as DripRecipe;
  it('항목별 최빈값, 동률이면 최근 값', () => {
    const rs = [mk(1, { doseG: 22 }), mk(2, { doseG: 20 }), mk(3, { doseG: 20 }), mk(4, { doseG: 22, tempC: 93 })];
    const d = recentDefaults(rs, 'ice', 'yangjae')!;
    expect(d.doseG).toBe(22); // 22 두 번(최근 포함) vs 20 두 번 → 최근
    expect(d.tempC).toBe(92);
    expect(d.pours?.map((p) => p.water)).toEqual([35, 55, 55, 45]);
  });
  it('다른 지점·타입은 제외, 없으면 null', () => {
    expect(recentDefaults([mk(1, { store: 'pangyo' })], 'ice', 'yangjae')).toBeNull();
    expect(recentDefaults([mk(1, {})], 'hot', 'yangjae')).toBeNull();
  });
});
