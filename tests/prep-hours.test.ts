import { describe, it, expect } from 'vitest';
import {
  buildHoursPrep,
  buildProductShareGrid,
  buildSharePrep,
  weekOrdinalLabel,
  OTHER_COL,
  type HourSale,
} from '@/lib/finance/prepHours';

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

describe('buildProductShareGrid', () => {
  const all: HourSale[] = [
    row({ sale_date: '2026-08-05', hour: 11, product: '브런치바', list_price: 10000, gross: 10000 }),
    row({ sale_date: '2026-08-05', hour: 11, product: '아메리카노', category: 'COFFEE', gross: 15000 }),
    row({ sale_date: '2026-08-05', hour: 12, product: '스콘', category: 'BAKERY', gross: 5000 }),
    row({ sale_date: '2026-08-06', hour: 10, product: '브런치바', list_price: 30000, gross: 30000 }),
    row({ sale_date: '2026-08-06', hour: 10, product: '아메리카노', category: 'COFFEE', gross: 5000 }),
  ];

  it('보고 있는 상품은 상위권 밖이어도 첫 열, 나머지는 매출순 + 기타', () => {
    const g = buildProductShareGrid(all, 'day', { top: 2, pin: '스콘' });
    // 핀(스콘)이 첫 열, 남은 한 자리는 매출 1위(브런치바 40,000 > 아메리카노 20,000)
    expect(g.columns.map((c) => c.product)).toEqual(['스콘', '브런치바', OTHER_COL]);
    expect(g.columns[2].gross).toBe(20000); // 아메리카노가 기타로
  });

  it('한 행의 비중 합은 100%, 기타가 잔여를 흡수한다', () => {
    const g = buildProductShareGrid(all, 'day', { top: 1, pin: '브런치바' });
    const day5 = g.rows.find((r) => r.bucket === '2026-08-05')!;
    expect(day5.total).toBe(30000);
    expect(day5.cells[0].share).toBeCloseTo(10000 / 30000, 6);
    expect(day5.cells.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 6);
    expect(day5.cells.at(-1)!.product).toBe(OTHER_COL);
    expect(day5.cells.at(-1)!.gross).toBe(20000);
  });

  it('전체 행은 전 구간 합, 행은 최신 구간 먼저', () => {
    const g = buildProductShareGrid(all, 'day', { top: 3, pin: '브런치바' });
    expect(g.rows[0].bucket).toBe('2026-08-06');
    expect(g.totalRow.total).toBe(65000);
    expect(g.totalRow.cells[0].share).toBeCloseTo(40000 / 65000, 6);
  });

  it('주 버킷 라벨은 그 달 몇 번째 월요일인지로 읽힌다', () => {
    expect(weekOrdinalLabel('2026-08-03')).toBe('8월 1주차');
    expect(weekOrdinalLabel('2026-08-17')).toBe('8월 3주차');
    expect(weekOrdinalLabel('2026-07-27')).toBe('7월 4주차');
  });
});
