import { describe, it, expect } from 'vitest';
import { mondayOf, pearson, buildReviewSales } from '@/lib/garden/review-sales';

describe('mondayOf', () => {
  it('KST 기준 그 주 월요일', () => {
    expect(mondayOf('2026-08-05')).toBe('2026-08-03'); // 수 → 월
    expect(mondayOf('2026-08-03')).toBe('2026-08-03'); // 월 그대로
    expect(mondayOf('2026-08-09')).toBe('2026-08-03'); // 일 → 그 주 월
  });
});

describe('pearson', () => {
  it('완전 비례 = 1, 표본 6 미만·분산 0 = null', () => {
    expect(pearson([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeNull();
    expect(pearson([1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6])).toBeNull();
  });
});

describe('buildReviewSales', () => {
  it('지점·주 단위로 매출과 리뷰를 조인한다 (진행 중인 이번 주 제외)', () => {
    const sales = [
      { sale_date: '2026-07-06', ym: '2026-07', category: 'COFFEE', supply: 100, store: 'yangjae' },
      { sale_date: '2026-07-07', ym: '2026-07', category: 'COFFEE', supply: 50, store: 'yangjae' },
      { sale_date: '2026-07-13', ym: '2026-07', category: 'COFFEE', supply: 200, store: 'yangjae' },
    ];
    const reviews = [
      { reviewed_at: '2026-07-07T12:00:00+09:00', rating: 5, store_key: 'yangjae' },
      { reviewed_at: '2026-07-08T12:00:00+09:00', rating: 4, store_key: 'yangjae' },
      { reviewed_at: '2026-07-14T12:00:00+09:00', rating: null, store_key: 'yangjae' },
    ];
    const [yj] = buildReviewSales(sales, reviews);
    expect(yj.store).toBe('yangjae');
    expect(yj.weeks).toHaveLength(2);
    expect(yj.weeks[0]).toMatchObject({ week: '2026-07-06', sales: 150, reviews: 2, avgRating: 4.5 });
    expect(yj.weeks[1]).toMatchObject({ week: '2026-07-13', sales: 200, reviews: 1, avgRating: null });
    expect(yj.corr.n).toBe(2); // 표본 부족 → 상관 null
    expect(yj.corr.same).toBeNull();
  });
});
