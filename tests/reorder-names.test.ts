import { describe, expect, it } from 'vitest';
import { buildCandidates, cleanProductName, groupByName, sellerStats, statForNames } from '@/lib/reorder/names';
import type { PurchaseRow } from '@/lib/reorder/types';

describe('발주 — 결제 상품명 정리', () => {
  it('네이버페이: 수령인 꼬리를 뗀다', () => {
    expect(cleanProductName('엘르앤비르 고메 버터 10kg @장나은(가든 양재점)')).toBe('엘르앤비르 고메 버터 10kg');
    expect(cleanProductName('웰루츠 냉동 멜론 다이스 1kg, 5개 @가든서비스/판교')).toBe('웰루츠 냉동 멜론 다이스 1kg, 5개');
    expect(cleanProductName('청정원 리치부어스트 소시지 오리지널 1.5kg 외 1종 중 총 1개 @장나은')).toBe('청정원 리치부어스트 소시지 오리지널 1.5kg');
  });

  it("쿠팡: '외 n건'과 미해석 표시를 뗀다", () => {
    expect(cleanProductName('피오디 라임, 1L, 4개 외 1건 🔍미해석')).toBe('피오디 라임, 1L, 4개');
    expect(cleanProductName('일화 초정탄산수 플레인, 190ml, 90개 🔍미해석')).toBe('일화 초정탄산수 플레인, 190ml, 90개');
    expect(cleanProductName('대상 리치부어스트, 1kg, 3개 외 8건 @양재천점')).toBe('대상 리치부어스트, 1kg, 3개');
  });

  it('꼬리가 없으면 그대로, 빈 값은 빈 문자열', () => {
    expect(cleanProductName('르네 홀그레인 머스타드 5kg 업소용 대용량')).toBe('르네 홀그레인 머스타드 5kg 업소용 대용량');
    expect(cleanProductName(null)).toBe('');
  });
});

describe('발주 — 반복 품목 후보', () => {
  const row = (date: string, seller: string, rawName: string, amount: number): PurchaseRow => ({ date, seller, rawName, amount });
  const rows = [
    row('2026-09-01', '서브큐', '앵커 버터 454g 20개 @장나은', 122400),
    row('2026-10-01', '서브큐', '앵커 버터 454g 20개 @장나은', 122400),
    row('2026-11-18', '맘쿠킹', '앵커 버터 454g 20개 @장나은', 290000),
    row('2026-10-05', '야채왕', '루꼴라 1kg @장나은', 10500),
    row('2026-10-12', '야채왕', '루꼴라 1kg @장나은', 10500),
    row('2026-11-01', '쿠팡', ' 🔍미해석', 5000),
  ];

  it('3회 이상 산 것만, 합계·최근 구매·판매처를 낸다', () => {
    const c = buildCandidates(rows);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ name: '앵커 버터 454g 20개', count: 3, sum: 534800, lastDate: '2026-11-18', lastAmount: 290000, lastSeller: '맘쿠킹', months: 3 });
    expect(c[0].sellers).toEqual(['서브큐', '맘쿠킹']);
  });

  it('이미 품목이거나 버린 이름은 뺀다', () => {
    expect(buildCandidates(rows, { skip: ['앵커 버터 454g 20개'] })).toEqual([]);
    expect(buildCandidates(rows, { minCount: 2, skip: ['앵커 버터 454g 20개'] }).map((c) => c.name)).toEqual(['루꼴라 1kg']);
  });

  it('품목에 묶인 이름들의 구매 요약과 판매처별 요약', () => {
    const byName = groupByName(rows);
    expect(statForNames(byName, ['앵커 버터 454g 20개', '루꼴라 1kg'])).toMatchObject({ count: 5, lastSeller: '맘쿠킹' });
    expect(statForNames(byName, ['없는 이름'])).toBeNull();
    const s = sellerStats(byName, ['앵커 버터 454g 20개']);
    expect(s.get('서브큐')).toMatchObject({ count: 2, lastDate: '2026-10-01', lastAmount: 122400 });
    expect(s.get('맘쿠킹')).toMatchObject({ count: 1 });
  });
});
