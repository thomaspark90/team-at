import { describe, expect, it } from 'vitest';
import { topicsOfScope } from '@/lib/garden-notify-topics';
import { groupByNav } from '@/lib/garden/notify-topic-groups';

describe('항목별 담당자 — 내비 순서 묶음', () => {
  const groups = groupByNav([...topicsOfScope('garden'), { id: 'transfer' }, { id: 'stock', tab: 'pricing' }], '회계');

  it('묶음이 내비 메뉴 순서로 나온다', () => {
    expect(groups.map((g) => g.label)).toEqual(['필터커피', '커피(필터)', '분석', '브런치 네임택', '회계']);
  });

  // 2026-11-24 발주·판매가를 원두 장부(필터커피)로 합쳤다 — 메뉴에서 빠진 탭의 항목도 장부 묶음에 들어간다
  it('묶음 안은 하위 탭 순서(레시피 → 발주 → 판매가 / 분쇄도 → 원두카드)', () => {
    expect(groups[0].items.map((t) => t.id)).toEqual(['recipeNew', 'recipeEdit', 'beanReceive', 'stock', 'salePriceRequest']);
    expect(groups[1].items.map((t) => t.id)).toEqual(['calibration', 'beanCard']);
  });

  it('가든 항목은 빠짐없이 한 번씩만 들어간다', () => {
    const ids = groups.flatMap((g) => g.items.map((t) => t.id));
    expect(ids.length).toBe(new Set(ids).size);
    expect(ids.length).toBe(topicsOfScope('garden').length + 2);
  });

  it('가든 항목은 모두 내비 메뉴에 속한다(기타 묶음으로 새지 않는다)', () => {
    expect(groups.at(-1)!.items.map((t) => t.id)).toEqual(['transfer']);
  });
});
