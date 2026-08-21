import { describe, it, expect } from 'vitest';
import { buildPnl, VAT_PAYMENT_RE, type PnlCat, type PnlTx } from '@/lib/finance/pnl';

// 부가세 납부 손익 제외(2026-08-21) — 관리손익은 매출을 공급가액(VAT 제외)으로,
// 과세 매입도 ÷1.1 순액으로 잡으므로 부가세 납부(예수금 정산)까지 지출로 잡으면 이중 차감이다.
// 신고월(1·4·7·10월)마다 고정비가 500~700만 부풀어 보이던 원인.

const CATS: PnlCat[] = [
  { id: 1, type: 'sga', name: '세금과공과', parent_id: null, vat_taxable: false },
  { id: 2, type: 'sga', name: '임대료', parent_id: null, vat_taxable: true },
];
const POS = [{ ym: '2026-07', category: 'MEAL', qty: 1, gross: 1100000, vat: 100000, supply: 1000000 }];
const tx = (catId: number, out: number, extra?: Partial<PnlTx>): PnlTx => ({
  category_id: catId,
  amount_in: 0,
  amount_out: out,
  ...extra,
});

describe('buildPnl 부가세 납부 제외', () => {
  it('is_vat_payment 지출은 고정비에서 빠지고 vatPayment 로만 노출된다', () => {
    const p = buildPnl('2026-07', {
      pos: POS,
      txns: [tx(1, 6753360, { is_vat_payment: true }), tx(1, 138630)],
      cats: CATS,
      inventory: [],
    });
    expect(p.vatPayment).toBe(6753360);
    expect(p.fixed).toBe(138630); // 원천분 등 일반 세금과공과는 그대로 지출
    // 영업이익에 부가세 납부가 안 끼는지 — 납부 거래가 아예 없을 때와 같아야 한다
    const base = buildPnl('2026-07', { pos: POS, txns: [tx(1, 138630)], cats: CATS, inventory: [] });
    expect(p.operatingProfit).toBe(base.operatingProfit);
  });

  it('플래그 미전달(구 호출)은 기존 동작 그대로 — 고정비에 포함', () => {
    const p = buildPnl('2026-07', { pos: POS, txns: [tx(1, 6753360)], cats: CATS, inventory: [] });
    expect(p.vatPayment).toBe(0);
    expect(p.fixed).toBe(6753360);
  });

  it('환급(입금)은 vatPayment 음수로 노출되고 손익엔 안 잡힌다', () => {
    const p = buildPnl('2026-07', {
      pos: POS,
      txns: [tx(1, 0, { amount_in: 2365000, is_vat_payment: true })],
      cats: CATS,
      inventory: [],
    });
    expect(p.vatPayment).toBe(-2365000);
    const base = buildPnl('2026-07', { pos: POS, txns: [], cats: CATS, inventory: [] });
    expect(p.operatingProfit).toBe(base.operatingProfit);
  });

  it('판정 패턴은 은행 메모의 부가가치세 표기에 걸린다', () => {
    expect(VAT_PAYMENT_RE.test('국세_부가가치세')).toBe(true);
    expect(VAT_PAYMENT_RE.test('지방소득세(특')).toBe(false);
    expect(VAT_PAYMENT_RE.test('국세_원천분')).toBe(false);
  });
});
