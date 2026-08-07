import { describe, it, expect } from 'vitest';
import { parsePosRows } from '@/lib/finance/pos';

// 토스 '상품 주문 상세내역' 파서 — 금액 규칙이 조용히 틀어지면 관리손익 전체가 틀어진다.
// 파일 형식(컬럼 순서·헤더 표기)이 바뀌어도 이 테스트가 규칙을 고정한다.

// 엑셀 serial (1900 date system, 1899-12-30 기준)
const serial = (ymd: string) => (Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000;

const HEADER = ['주문기준일자', '결제상태', '주문채널', '상품명', '카테고리', '수량', '실판매금액(할인,옵션포함)', '과세여부', '부가세액'];
const row = (ymd: string, state: string, name: string, cat: string, qty: number, amount: number, vat: number) => [
  serial(ymd), state, '포스', name, cat, qty, amount, '과세', vat,
];

describe('parsePosRows (토스)', () => {
  it('완료·취소(net)·공급가액 산출과 일×카테고리 집계', () => {
    const r = parsePosRows([
      HEADER,
      ['설명행', '', '', '', '', '', '', '', ''],
      row('2026-06-02', '완료', '아메리카노', 'COFFEE', 2, 9000, 818),
      row('2026-06-02', '완료', '라떼', 'COFFEE', 1, 5500, 500),
      row('2026-06-02', '취소', '라떼', 'COFFEE', -1, -5500, -500), // 취소는 음수 그대로 net
      row('2026-06-03', '완료', '크루아상', 'BAKERY', 1, 4000, 364),
    ]);
    expect(r.ym).toBe('2026-06');
    expect(r.meta.completed).toBe(3);
    expect(r.meta.canceled).toBe(1);
    const coffee = r.rows.find((d) => d.saleDate === '2026-06-02' && d.category === 'COFFEE')!;
    expect(coffee.gross).toBe(9000); // 9000 + 5500 - 5500
    expect(coffee.vat).toBe(818);
    expect(coffee.supply).toBe(coffee.gross - coffee.vat);
    expect(r.totals.gross).toBe(13000);
    expect(r.totals.supply).toBe(r.totals.gross - r.totals.vat);
  });

  it('상품권(금액권별/선불권)은 선수금 — 매출에서 제외', () => {
    const r = parsePosRows([
      HEADER,
      row('2026-06-02', '완료', '아메리카노', 'COFFEE', 1, 5000, 455),
      row('2026-06-02', '완료', '5만원권', '금액권별', 1, 50000, 0),
      row('2026-06-02', '완료', '선불카드', '선불권', 1, 30000, 0),
    ]);
    expect(r.excluded.rows).toBe(2);
    expect(r.excluded.gross).toBe(80000);
    expect(r.totals.gross).toBe(5000); // 상품권 제외
    expect(r.rows).toHaveLength(1);
  });

  it('헤더를 못 찾으면 빈 결과 (형식 변경 감지)', () => {
    const r = parsePosRows([['엉뚱한', '헤더'], [1, 2]]);
    expect(r.rows).toHaveLength(0);
    expect(r.ym).toBe('');
  });
});
