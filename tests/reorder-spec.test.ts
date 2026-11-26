import { describe, expect, it } from 'vitest';
import { formatSpec, parseSpec, unitPrice } from '@/lib/reorder/spec';

describe('발주 — 규격 해석', () => {
  it('낱개 양 × 묶음 수', () => {
    expect(parseSpec('[1개 더 증정] 앵커FP 버터 454g 20개 무료보냉')).toBeNull(); // '1개'와 '20개' 두 가지로 읽힌다 → 추측하지 않는다
    expect(parseSpec('앵커 버터 454g 20개')).toEqual({ qty: 454, unit: 'g', pack: 20 });
    expect(parseSpec('동원 통그릴후랑크 840gx10개')).toEqual({ qty: 840, unit: 'g', pack: 10 });
    expect(parseSpec('슈가데일 베이컨 454g 1박스(24개)')).toEqual({ qty: 454, unit: 'g', pack: 24 });
    expect(parseSpec('일화 초정탄산수 플레인, 190ml, 90개')).toEqual({ qty: 190, unit: 'ml', pack: 90 });
  });

  it('kg·L 는 g·ml 로 환산한다', () => {
    expect(parseSpec('엘르앤비르 고메 버터 10kg')).toEqual({ qty: 10000, unit: 'g', pack: 1 });
    expect(parseSpec('서울우유 플레인 요거트 순수무가당 2.45L 더진한')).toEqual({ qty: 2450, unit: 'ml', pack: 1 });
    expect(parseSpec('동서 리치골드 휘핑크림 1L 1박스 12개')).toEqual({ qty: 1000, unit: 'ml', pack: 12 });
    expect(parseSpec('트레디션T65 25kg 화학첨가제미첨가')).toEqual({ qty: 25000, unit: 'g', pack: 1 });
  });

  it('양이 두 가지로 읽히면 규격 미확인', () => {
    expect(parseSpec('벌크 앵커FP버터 20kg (5kgx4개)')).toBeNull();
    expect(parseSpec('샐러리 국내산 특급품 5kg, 10kg 셀러리')).toBeNull();
  });

  it('무게가 없고 개수만 있으면 개 단위, 아무것도 없으면 미확인', () => {
    expect(parseSpec('캠브로 쟁반 카페 사각 대(350x270), 7번.화이트, 1개')).toEqual({ qty: 1, unit: 'ea', pack: 1 });
    expect(parseSpec('장가네제과 수제 케이크시트 1BOX 화이트 1호')).toBeNull();
  });

  it('표기와 단위당 가격', () => {
    expect(formatSpec({ qty: 454, unit: 'g', pack: 20 })).toBe('454g × 20개');
    expect(formatSpec({ qty: 10000, unit: 'g', pack: 1 })).toBe('10kg');
    expect(formatSpec({ qty: 2450, unit: 'ml', pack: 1 })).toBe('2.45L');
    expect(formatSpec({ qty: 1, unit: 'ea', pack: 24 })).toBe('24개');
    expect(formatSpec(null)).toBe('규격 미확인');
    // 122,400원 ÷ (454g × 20) × 100g = 1,348원
    expect(unitPrice(122400, { qty: 454, unit: 'g', pack: 20 })).toBe(1348);
    // 59,800원 ÷ (1,000ml × 12) × 1,000ml = 4,983원
    expect(unitPrice(59800, { qty: 1000, unit: 'ml', pack: 12 })).toBe(4983);
    expect(unitPrice(72000, { qty: 1, unit: 'ea', pack: 24 })).toBe(3000);
  });
});
