import { describe, it, expect } from 'vitest';
import { aggregate, type AggCat, type AggTx } from '@/lib/finance/aggregate';
import { resolveCostNature, describeCostNature, nextCostNature } from '@/lib/finance/costNature';

// 고정비/변동비 구분(cost_nature) — 2026-08-31 대표 결정.
// 계정과목 속성(자기 값 → 상위 상속 → 미확정)으로 지출을 고정/변동/미확정 세 칸에 나누고,
// 세 칸의 합은 항상 cogs + sga 와 같아야 한다(미분류·미상은 미확정).

const CATS: AggCat[] = [
  { id: 1, type: 'cogs', name: '재료비', parent_id: null, vat_taxable: false, cost_nature: 'variable' },
  { id: 2, type: 'sga', name: '인건비', parent_id: null, vat_taxable: false, cost_nature: 'fixed' },
  { id: 3, type: 'sga', name: '단기', parent_id: 2, vat_taxable: false, cost_nature: null }, // 상위(인건비) 상속 → 고정
  { id: 4, type: 'sga', name: '소모품비', parent_id: null, vat_taxable: false, cost_nature: 'variable' },
  { id: 5, type: 'sga', name: '지급수수료', parent_id: null, vat_taxable: false, cost_nature: 'variable' },
  { id: 6, type: 'sga', name: '세무기장료', parent_id: 5, vat_taxable: false, cost_nature: 'fixed' }, // 자기 값이 상위를 이김
  { id: 7, type: 'sga', name: '외주용역비', parent_id: null, vat_taxable: false, cost_nature: null }, // 최상위 미지정 → 미확정
  { id: 69, type: 'excluded', name: '미상', parent_id: null, vat_taxable: false },
  { id: 90, type: 'revenue', name: '카드매출', parent_id: null, cost_nature: null },
];
const catMap = new Map(CATS.map((c) => [c.id, c]));

const tx = (category_id: number | null, amount_out: number, extra: Partial<AggTx> = {}): AggTx => ({
  tx_at: '2026-08-10T09:00:00+09:00',
  amount_in: 0,
  amount_out,
  category_id,
  ...extra,
});

describe('resolveCostNature', () => {
  it('자기 값 → 상위 상속 → 미확정(null) 순으로 판정한다', () => {
    expect(resolveCostNature(catMap.get(1)!, catMap)).toBe('variable');
    expect(resolveCostNature(catMap.get(3)!, catMap)).toBe('fixed'); // 단기 ← 인건비
    expect(resolveCostNature(catMap.get(6)!, catMap)).toBe('fixed'); // 세무기장료 자기 값이 상위(변동)를 이김
    expect(resolveCostNature(catMap.get(7)!, catMap)).toBeNull();
    expect(resolveCostNature(catMap.get(90)!, catMap)).toBeNull(); // 매출 타입은 대상 아님
  });
  it('describe 는 상속 여부를 구분하고, 토글은 미지정→고정→변동→미지정 순환', () => {
    expect(describeCostNature(catMap.get(3)!, catMap)).toEqual({ nature: 'fixed', inherited: true });
    expect(describeCostNature(catMap.get(2)!, catMap)).toEqual({ nature: 'fixed', inherited: false });
    expect(describeCostNature(catMap.get(7)!, catMap)).toEqual({ nature: null, inherited: false });
    expect(nextCostNature(null)).toBe('fixed');
    expect(nextCostNature('fixed')).toBe('variable');
    expect(nextCostNature('variable')).toBeNull();
  });
});

describe('aggregate 고정/변동/미확정', () => {
  it('세 칸 합 = cogs + sga, 상속·미분류·미상 규칙대로 나뉜다', () => {
    const txns: AggTx[] = [
      tx(1, 1_000_000), // 재료비 → 변동
      tx(2, 3_000_000), // 인건비 → 고정
      tx(3, 500_000), // 단기 → 고정(상속)
      tx(4, 200_000), // 소모품 → 변동
      tx(6, 110_000), // 세무기장료 → 고정
      tx(7, 70_000), // 외주용역비(미지정) → 미확정
      tx(null, 40_000), // 미분류 → 미확정
      tx(69, 30_000), // 미상 → 미확정
    ];
    const { months } = aggregate(txns, CATS, 'month', false);
    const m = months[0];
    expect(m.fixedCost).toBe(3_000_000 + 500_000 + 110_000);
    expect(m.variableCost).toBe(1_000_000 + 200_000);
    expect(m.undeterminedCost).toBe(70_000 + 40_000 + 30_000);
    expect(m.fixedCost + m.variableCost + m.undeterminedCost).toBe(m.cogs + m.sga);
  });

  it('카드대금↔수집분 겹침 차감이 고정/변동 칸에도 같은 비율로 반영된다', () => {
    const txns: AggTx[] = [
      tx(1, 1_000_000, { source: 'bank', is_card_payment: true }), // 카드대금(재료비, 변동)
      tx(1, 400_000, { source: 'coupang' }), // 수집분(재료비, 변동) → 400,000 겹침 차감
      tx(2, 2_000_000), // 인건비 고정
    ];
    const { months } = aggregate(txns, CATS, 'month', false);
    const m = months[0];
    expect(m.cardDupOffset).toBe(400_000);
    expect(m.variableCost).toBe(1_000_000 + 400_000 - 400_000);
    expect(m.fixedCost).toBe(2_000_000);
    expect(m.fixedCost + m.variableCost + m.undeterminedCost).toBe(m.cogs + m.sga);
  });
});
