import { describe, it, expect } from 'vitest';
import { buildHoursPrep, buildSharePrep, type HourSale } from '@/lib/finance/prepHours';

// 전처리5 — 시간대·그램·비중 규칙 고정. 그램은 정가(list_price) 기준이라는 게 핵심이다.
const row = (p: Partial<HourSale> & { sale_date: string; hour: number; product: string }): HourSale => ({
  category: '브런치',
  option: '',
  qty: 1,
  orders: 1,
  list_price: 0,
  gross: 0,
  ...p,
});

describe('buildHoursPrep', () => {
  it('평균 그램은 정가 ÷ 30원 — 할인으로 깎인 실판매금액이 아니다', () => {
    const r = buildHoursPrep(
      [
        row({ sale_date: '2026-08-05', hour: 11, product: '브런치바', list_price: 12000, gross: 8400 }), // 30% 할인
        row({ sale_date: '2026-08-05', hour: 11, product: '브런치바', list_price: 15000, gross: 15000 }),
      ],
      'garden',
      'yangjae',
      'day',
    );
    expect(r.totals.grams).toBe(900); // (12000+15000)/30
    expect(r.totals.avgGram).toBe(450);
    expect(r.totals.gross).toBe(23400); // 매출은 할인 반영
    expect(r.hours[0].hour).toBe(11);
  });

  it('그램 규칙이 없는 상품은 그램이 null (열이 사라진다)', () => {
    const r = buildHoursPrep(
      [row({ sale_date: '2026-08-05', hour: 9, product: '아메리카노', category: 'COFFEE', list_price: 5000, gross: 5000 })],
      'garden',
      'yangjae',
      'day',
    );
    expect(r.totals.grams).toBeNull();
    expect(r.totals.avgGram).toBeNull();
  });
});

describe('buildSharePrep', () => {
  const all: HourSale[] = [
    // 8/5 — 브런치바 10,000 / 전체 25,000
    row({ sale_date: '2026-08-05', hour: 11, product: '브런치바', list_price: 10000, gross: 10000 }),
    row({ sale_date: '2026-08-05', hour: 11, product: '아메리카노', category: 'COFFEE', gross: 15000 }),
    // 8/6 — 브런치바 30,000 / 전체 35,000
    row({ sale_date: '2026-08-06', hour: 10, product: '브런치바', list_price: 30000, gross: 30000 }),
    row({ sale_date: '2026-08-06', hour: 10, product: '아메리카노', category: 'COFFEE', gross: 5000 }),
    // 8/4 — 브런치바 판매 전(평균에서 빠져야 한다)
    row({ sale_date: '2026-08-04', hour: 10, product: '아메리카노', category: 'COFFEE', gross: 20000 }),
  ];

  it('구간별 비중과 전체 비중', () => {
    const s = buildSharePrep(all, '브런치바', 'garden', 'yangjae', 'day');
    expect(s.rows[0].bucket).toBe('2026-08-06'); // 최신 먼저
    expect(s.rows[0].share).toBeCloseTo(30000 / 35000, 6);
    expect(s.totals.itemGross).toBe(40000);
    expect(s.totals.totalGross).toBe(80000);
    expect(s.totals.share).toBeCloseTo(0.5, 6);
  });

  it('평균은 상품이 팔린 구간만 대상이고, 비중은 합÷합(가중)이다', () => {
    const s = buildSharePrep(all, '브런치바', 'garden', 'yangjae', 'day');
    const day = s.averages.find((a) => a.grain === 'day')!;
    expect(day.buckets).toBe(2); // 8/4 제외
    expect(day.itemGross).toBe(20000); // (10000+30000)/2
    expect(day.totalGross).toBe(30000); // (25000+35000)/2 — 8/4 의 20000 은 빠짐
    // 가중 비중 40000/60000 ≠ 산술평균((0.4+0.857)/2=0.629)
    expect(day.share).toBeCloseTo(40000 / 60000, 6);
    expect(day.avgGram).toBeCloseTo(40000 / 30 / 2, 6);
  });

  it('월 평균은 같은 달을 한 구간으로 묶는다', () => {
    const s = buildSharePrep(all, '브런치바', 'garden', 'yangjae', 'month');
    const month = s.averages.find((a) => a.grain === 'month')!;
    expect(month.buckets).toBe(1);
    expect(month.itemGross).toBe(40000);
    expect(month.totalGross).toBe(80000); // 월 단위에선 8/4 도 같은 구간이라 포함
  });
});
