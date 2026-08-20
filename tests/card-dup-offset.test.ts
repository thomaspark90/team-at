import { describe, it, expect } from 'vitest';
import { aggregate, type AggCat, type AggTx } from '@/lib/finance/aggregate';
import { buildPnl, type PnlCat, type PnlTx } from '@/lib/finance/pnl';

// 카드대금↔수집분 이중계상 차감(cardOffset.ts) — 2026-08-20 진단.
// 스탭밀 카드대금 인출이 '재료비'로 분류돼 손익에 들어가는데, 같은 카드로 결제된
// 네이버페이·쿠팡 수집분도 각자 계정으로 또 들어가 지출이 부풀었다.
// 규칙: 월 단위에서만, 손익에 실린 카드대금과 수집분 중 작은 쪽만큼 카드대금 자리에서 차감.

const CATS: AggCat[] = [
  { id: 1, type: 'cogs', name: '재료비', parent_id: null },
  { id: 69, type: 'excluded', name: '미상', parent_id: null },
];
const AT = '2026-05-10T09:00:00+09:00';
const tx = (over: Partial<AggTx>): AggTx => ({ tx_at: AT, amount_in: 0, amount_out: 0, category_id: 1, ...over });
const POS = [{ saleDate: '2026-05-10', supply: 10_000_000 }];

describe('aggregate 카드대금↔수집분 차감', () => {
  it('월 단위: 수집분만큼 카드대금(재료비)에서 빼 EBIT 이중계상을 없앤다', () => {
    const txns: AggTx[] = [
      tx({ amount_out: 11_000_000, source: 'bank', is_card_payment: true }), // 카드대금 인출(재료비 분류) → 순액 10,000,000
      tx({ amount_out: 5_500_000, source: 'naverpay' }), // 수집분(재료비) → 순액 5,000,000 — 카드대금에 이미 포함된 돈
    ];
    const { months } = aggregate(txns, CATS, 'month', true, POS);
    expect(months).toHaveLength(1);
    expect(months[0].cardDupOffset).toBe(5_000_000);
    expect(months[0].cogs).toBe(10_000_000); // 15,000,000 − 겹침 5,000,000
    expect(months[0].expense['재료비']).toBe(10_000_000);
    expect(months[0].ebit).toBe(0);
  });

  it('수집분이 카드대금보다 커도 카드대금까지만 뺀다(클램프)', () => {
    const txns: AggTx[] = [
      tx({ amount_out: 1_100_000, source: 'bank', is_card_payment: true }), // 순액 1,000,000
      tx({ amount_out: 5_500_000, source: 'naverpay' }), // 순액 5,000,000
    ];
    const { months } = aggregate(txns, CATS, 'month', true, POS);
    expect(months[0].cardDupOffset).toBe(1_000_000);
    expect(months[0].cogs).toBe(5_000_000); // 카드대금 몫은 전부 상쇄, 수집분은 그대로
  });

  it('카드대금이 없는 달(은행 자료 미업로드)은 차감 없이 수집분이 그대로 남는다', () => {
    const txns: AggTx[] = [tx({ amount_out: 5_500_000, source: 'naverpay' })];
    const { months } = aggregate(txns, CATS, 'month', true, POS);
    expect(months[0].cardDupOffset).toBe(0);
    expect(months[0].cogs).toBe(5_000_000);
  });

  it('주 단위는 차감하지 않는다(결제일·사용일이 어긋나는 현금흐름 관점 — 전처리1과 동일)', () => {
    const txns: AggTx[] = [
      tx({ amount_out: 11_000_000, source: 'bank', is_card_payment: true }),
      tx({ amount_out: 5_500_000, source: 'naverpay' }),
    ];
    const { months } = aggregate(txns, CATS, 'week', true, POS);
    expect(months[0].cardDupOffset).toBe(0);
    expect(months[0].cogs).toBe(15_000_000);
  });

  it("'미상'(용도 불명)은 총액 그대로 지출에 포함된다 — 관리손익과 동일 규칙", () => {
    const txns: AggTx[] = [
      tx({ category_id: 69, amount_out: 3_000_000 }),
      tx({ category_id: 69, amount_in: 1_000_000 }),
    ];
    const { months, expenseKeys } = aggregate(txns, CATS, 'month', true, POS);
    expect(months[0].sga).toBe(2_000_000);
    expect(months[0].expense['미상']).toBe(2_000_000);
    expect(expenseKeys).toContain('미상');
    expect(months[0].ebit).toBe(10_000_000 - 2_000_000);
  });
});

const PNL_CATS: PnlCat[] = [{ id: 1, type: 'cogs', name: '재료비', parent_id: null }];
const PNL_POS = [{ ym: '2026-05', category: 'MEAL', qty: 1, gross: 11_000_000, vat: 1_000_000, supply: 10_000_000 }];
const ptx = (over: Partial<PnlTx>): PnlTx => ({ category_id: 1, amount_in: 0, amount_out: 0, ...over });

describe('buildPnl 카드대금↔수집분 차감', () => {
  it('재료비로 분류된 카드대금에서 수집분을 빼고 차감액을 노출한다', () => {
    const base = buildPnl('2026-05', {
      pos: PNL_POS,
      txns: [ptx({ amount_out: 11_000_000, source: 'bank', is_card_payment: true })],
      cats: PNL_CATS,
      inventory: [],
    });
    expect(base.cardDupOffset).toBe(0); // 수집분이 없으면 차감 없음

    const p = buildPnl('2026-05', {
      pos: PNL_POS,
      txns: [
        ptx({ amount_out: 11_000_000, source: 'bank', is_card_payment: true }),
        ptx({ amount_out: 5_500_000, source: 'naverpay' }),
      ],
      cats: PNL_CATS,
      inventory: [],
    });
    expect(p.cardDupOffset).toBe(5_000_000);
    expect(p.cogs.식자재.매입).toBe(10_000_000); // 15,000,000 − 겹침 5,000,000
    expect(p.operatingProfit).toBe(base.operatingProfit); // 수집분은 카드대금 안의 돈 — 추가돼도 이익이 안 변해야 정상
  });

  it('구 호출(source 미전달)은 동작이 그대로다', () => {
    const p = buildPnl('2026-05', {
      pos: PNL_POS,
      txns: [ptx({ amount_out: 11_000_000 }), ptx({ amount_out: 5_500_000 })],
      cats: PNL_CATS,
      inventory: [],
    });
    expect(p.cardDupOffset).toBe(0);
    expect(p.cogs.식자재.매입).toBe(15_000_000);
  });
});
