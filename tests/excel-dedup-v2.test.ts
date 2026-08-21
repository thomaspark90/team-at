import { describe, expect, it } from 'vitest';
import { rowsToTransactions, type ExcelMapping } from '@/lib/finance/excel';
import { dedupe } from '@/lib/finance/parse';

// 지문 v2 (2026-08-21 감사 D9) — 브랜드·은행·동일튜플 순번 포함.
//  A1: 같은 날 같은 금액·같은 메모의 실제 2건(시간·잔액 미매핑)이 1건으로 합쳐지던 문제
//  A2: 'excel' 고정 프리픽스라 브랜드 간 지문이 교차 충돌하던 문제
// 재업로드 안정성(같은 파일 → 전부 중복)과 구지문 병행 대조(재중복 차단)를 함께 고정한다.

const mapping: ExcelMapping = {
  header_row: 0,
  date: 0,
  time: null,
  memo: 1,
  channel: null,
  amount_in: null,
  amount_out: 2,
  amount_signed: null,
  signed_out_positive: null,
  balance: null, // 잔액 미매핑 — 지문이 (날짜,금액,메모)로 축소되는 위험 시나리오
};

// 같은 날 같은 거래처에 같은 금액 2번 이체 — 실제 별건
const rows: string[][] = [
  ['날짜', '내용', '출금'],
  ['2026-08-01', '한결농산', '150000'],
  ['2026-08-01', '한결농산', '150000'],
  ['2026-08-02', '제일유통', '80000'],
];

describe('은행 엑셀 지문 v2', () => {
  const id = { brand: 'staffmeal', bank: 'shinhan' };

  it('동일 튜플 2건이 서로 다른 지문을 받아 둘 다 저장된다 (A1)', () => {
    const r = rowsToTransactions(rows, mapping, id);
    expect(r.transactions).toHaveLength(3);
    const [a, b] = r.transactions;
    expect(a.dedupHash).not.toBe(b.dedupHash);
    expect(a.legacyDedupHash).toBe(b.legacyDedupHash); // 구지문은 같다(병합됐을 대상)
    const { fresh, duplicates } = dedupe(r.transactions, new Set());
    expect(fresh).toHaveLength(3);
    expect(duplicates).toBe(0);
  });

  it('브랜드가 다르면 같은 내용도 지문이 다르다 (A2)', () => {
    const a = rowsToTransactions(rows, mapping, { brand: 'staffmeal', bank: 'shinhan' }).transactions[0];
    const b = rowsToTransactions(rows, mapping, { brand: 'garden', bank: 'shinhan' }).transactions[0];
    expect(a.dedupHash).not.toBe(b.dedupHash);
  });

  it('같은 파일 재업로드는 전부 중복으로 걸러진다 (순번 안정성)', () => {
    const first = rowsToTransactions(rows, mapping, id).transactions;
    const again = rowsToTransactions(rows, mapping, id).transactions;
    const existing = new Set(first.map((t) => t.dedupHash));
    const { fresh, duplicates } = dedupe(again, existing);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toBe(3);
  });

  it('옛 지문(v1)으로 적재된 과거 거래는 구지문 대조로 중복 처리된다 (재중복 차단)', () => {
    const legacyOnly = rowsToTransactions(rows, mapping).transactions; // identity 없음 = v1 지문
    const v2 = rowsToTransactions(rows, mapping, id).transactions;
    const existing = new Set(legacyOnly.map((t) => t.dedupHash)); // DB 에 v1 지문만 있는 상태
    const { fresh, duplicates } = dedupe(v2, existing);
    // v1 시절엔 동일 튜플이 1건으로 병합돼 있었으므로, v2의 두 건 모두 그 구지문에 걸린다
    expect(fresh).toHaveLength(0);
    expect(duplicates).toBe(3);
  });

  it('identity 없이 부르면 v1 지문 그대로 (구 호출 호환 — 동일 튜플은 같은 지문)', () => {
    const r = rowsToTransactions(rows, mapping);
    expect(r.transactions[0].legacyDedupHash).toBeUndefined();
    expect(r.transactions[0].dedupHash).toBe(r.transactions[1].dedupHash);
  });
});
