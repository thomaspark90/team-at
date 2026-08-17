import { describe, it, expect } from 'vitest';
import { buildPnl, type PnlCat, type PnlTx } from '@/lib/finance/pnl';

// 카드대금 대사(연결 기반 트리거) — '카드대금정산' 분류만으로 손익에서 빠지면
// 명세 미업로드 달의 카드 지출이 증발해 이익이 과대된다(2026-08-17 보완).
// 규칙: 미연결 인출 = '카드 지출(미분해)'로 포함 / 연결 인출 = 제외 + 인출↔사용액 차액 노출.

const CATS: PnlCat[] = [
  { id: 1, type: 'cogs', name: '재료비', parent_id: null },
  { id: 57, type: 'excluded', name: '카드대금정산', parent_id: null, vat_taxable: false },
];
const lump = (amount: number): PnlTx => ({ category_id: 57, amount_in: 0, amount_out: amount });
const POS = [{ ym: '2026-07', category: 'COFFEE', qty: 1, gross: 1100000, vat: 100000, supply: 1000000 }];

describe('buildPnl 카드대금 대사', () => {
  it('정밀 모드: 미연결 카드대금은 cardLump로 포함돼 영업이익을 줄인다', () => {
    const base = buildPnl('2026-07', { pos: POS, txns: [lump(500000)], cats: CATS, inventory: [] });
    // cardReconcile 미전달(구 호출) — 기존 동작 유지: lump 무시
    expect(base.cardLump).toBe(0);
    expect(base.cardReconcile).toBeNull();

    const p = buildPnl('2026-07', {
      pos: POS,
      txns: [lump(500000)],
      cats: CATS,
      inventory: [],
      cardReconcile: { unsettledLump: 500000, settledWithdrawn: 0, settledUsage: 0 },
    });
    expect(p.cardLump).toBe(500000);
    expect(p.operatingProfit).toBe(base.operatingProfit - 500000);
  });

  it('정밀 모드: 연결된 인출은 제외되고 인출↔사용액 차액이 노출된다', () => {
    const p = buildPnl('2026-07', {
      pos: POS,
      txns: [lump(1000000)],
      cats: CATS,
      inventory: [],
      cardReconcile: { unsettledLump: 0, settledWithdrawn: 1000000, settledUsage: 970000 },
    });
    expect(p.cardLump).toBe(0); // 연결됐으니 미분해 지출 없음
    expect(p.cardReconcile).toEqual({
      unsettledLump: 0,
      settledWithdrawn: 1000000,
      settledUsage: 970000,
      diff: 30000, // 인출 − 사용액 (할부·취소·시차 등) — 경고 표시용, 지출엔 강제 반영 안 함
    });
  });

  it('쿠팡·네이버페이 대체 출금: 세부 미수집 몫(payLump)은 지출로 포함돼 영업이익을 줄인다', () => {
    const base = buildPnl('2026-07', { pos: POS, txns: [], cats: CATS, inventory: [] });
    expect(base.payLump).toBeNull(); // 미전달(구 호출) — 기존 동작 유지

    const p = buildPnl('2026-07', {
      pos: POS,
      txns: [],
      cats: CATS,
      inventory: [],
      payLump: { coupang: 120000, naverpay: 80000 },
    });
    expect(p.payLump).toEqual({ coupang: 120000, naverpay: 80000 });
    expect(p.operatingProfit).toBe(base.operatingProfit - 200000);
  });
});
