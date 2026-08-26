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

// 시간대 행(pos_item_hours) — 2026-08-26. 그램 단위 판매(브런치바) 평균 그램이 여기 정가에 달려 있다.
const FULL_HEADER = [
  '주문기준일자', '결제상태', '주문시작시각', '주문채널', '주문번호', '상품명', '상품코드', '카테고리',
  '옵션', '상품할인', '주문할인', '수량', '상품가격', '옵션가격', '상품할인 금액', '주문할인 금액',
  '실판매금액 \n (할인, 옵션 포함)', '과세여부', '부가세액',
];
const fullRow = (
  ymd: string, time: string, orderNo: string, name: string, cat: string,
  qty: number, price: number, amount: number, vat: number, state = '완료',
) => [ymd, state, `${ymd} ${time}`, '포스', orderNo, name, '', cat, '', '', '', qty, price, 0, 0, price - amount, amount, '과세', vat];

describe('parsePosRows — 시간대 행', () => {
  it('시각·상품별로 묶고 주문 수는 고유 주문번호로 센다', () => {
    const r = parsePosRows([
      FULL_HEADER,
      fullRow('2026-08-05', '11:10:00', '063', '브런치바', '브런치', 1, 12180, 12180, 1107),
      fullRow('2026-08-05', '11:32:05', '063', '브런치바', '브런치', 1, 16620, 16620, 1511), // 같은 주문, 두 접시
      fullRow('2026-08-05', '12:01:00', '071', '브런치바', '브런치', 1, 9000, 9000, 818),
    ]);
    const h11 = r.hours!.find((h) => h.hour === 11)!;
    expect(h11.qty).toBe(2);
    expect(h11.orders).toBe(1); // 주문번호 063 하나
    expect(h11.listPrice).toBe(28800);
    expect(r.hours!.find((h) => h.hour === 12)!.orders).toBe(1);
    // 시간대 합 = 품목 합 (정합)
    const itemQty = r.items!.filter((i) => i.product === '브런치바').reduce((s, i) => s + i.qty, 0);
    expect(r.hours!.reduce((s, h) => s + h.qty, 0)).toBe(itemQty);
  });

  it('할인·취소가 있어도 그램 기준인 정가(listPrice)는 깎이지 않는다', () => {
    const r = parsePosRows([
      FULL_HEADER,
      fullRow('2026-08-05', '11:10:00', '063', '브런치바', '브런치', 1, 12180, 8526, 775), // 30% 할인
      fullRow('2026-08-05', '11:20:00', '064', '브런치바', '브런치', 1, 15240, 0, 0), // 선불권 전액 차감
    ]);
    const h = r.hours!.find((x) => x.hour === 11)!;
    expect(h.listPrice).toBe(27420); // 정가 그대로 — 그램은 여기서 나온다
    expect(h.gross).toBe(8526); // 매출은 실판매금액
  });

  it('시각 컬럼이 없는 리포트는 시간대 행을 만들지 않는다 (매출 집계는 그대로)', () => {
    const r = parsePosRows([
      HEADER,
      row('2026-06-02', '완료', '아메리카노', 'COFFEE', 1, 5000, 455),
    ]);
    expect(r.hours).toEqual([]);
    expect(r.totals.gross).toBe(5000);
  });

  it('상품권(선수금)은 시간대 행에도 안 들어간다', () => {
    const r = parsePosRows([
      FULL_HEADER,
      fullRow('2026-08-05', '11:10:00', '063', '5만원권', '금액권별', 1, 50000, 50000, 0),
      fullRow('2026-08-05', '11:20:00', '064', '브런치바', '브런치', 1, 9000, 9000, 818),
    ]);
    expect(r.hours!).toHaveLength(1);
    expect(r.hours![0].product).toBe('브런치바');
  });
});
