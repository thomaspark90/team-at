import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePayhereXlsx } from '@/lib/finance/payhere';

// 페이히어 '매장별 결제 내역(요약)' 파서 — 실측 규칙(2026-07-31 보정)을 고정한다.
// 핵심: 매출 = '결제 금액'(합계를 쓰면 할인만큼 과대), 식권 판매 제외, 환불 음수 net.

const SHEET = '매장별 결제 내역(요약)';

function makeXlsx(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// 실측 파일과 동일하게 제목·요약 6행 뒤에 헤더가 온다
const FILLER: unknown[][] = [['매장별 결제 내역'], [], ['기간: 2026-07-01 ~ 2026-07-31'], [], [], []];
const HEADER = ['No.', '영업일', '결제(환불)일', '결제 내역', '합계', '결제 금액', '공급가액', '부가세', '결제 수단'];

describe('parsePayhereXlsx (페이히어)', () => {
  it('결제 금액 기준 집계 · 메뉴명 첫 토큰 카테고리 · 공급가액 컬럼 사용', async () => {
    const buf = makeXlsx([
      ...FILLER,
      HEADER,
      [1, '2026-07-01', '2026-07-01 12:01', 'Staff (기본 / 매장) 외 1건', 11000, 10000, 9091, 909, '카드'],
      [2, '2026-07-01', '2026-07-01 12:30', 'Newbie (매장)', 8000, 8000, 7273, 727, '카드'],
      [3, '2026-07-02', '2026-07-02 11:50', 'Staff (기본)', 5500, 5000, 4545, 455, '기타'],
    ]);
    const r = await parsePayhereXlsx(buf);
    expect(r.ym).toBe('2026-07');
    // 합계(11000)가 아니라 결제 금액(10000)을 써야 한다
    expect(r.totals.gross).toBe(23000);
    const staff = r.byCategory.find((c) => c.category === 'Staff')!;
    expect(staff.gross).toBe(15000);
    const d1 = r.rows.find((d) => d.saleDate === '2026-07-01' && d.category === 'Staff')!;
    expect(d1.supply).toBe(9091); // 공급가액 컬럼 그대로
    expect(d1.vat).toBe(909);
  });

  it('식권 판매는 선수금 — 제외, 환불 음수는 net 합산', async () => {
    const buf = makeXlsx([
      ...FILLER,
      HEADER,
      [1, '2026-07-01', '', '식권 10장', 100000, 100000, 90909, 9091, '카드'],
      [2, '2026-07-01', '', 'Staff (기본)', 10000, 10000, 9091, 909, '카드'],
      [3, '2026-07-01', '', 'Staff (기본)', -10000, -5000, -4545, -455, '카드'], // 부분 환불
    ]);
    const r = await parsePayhereXlsx(buf);
    expect(r.excluded.rows).toBe(1);
    expect(r.excluded.gross).toBe(100000);
    expect(r.meta.canceled).toBe(1);
    const staff = r.rows.find((d) => d.category === 'Staff')!;
    expect(staff.gross).toBe(5000); // 10000 - 5000
    expect(staff.supply).toBe(4546); // 9091 - 4545
  });
});
