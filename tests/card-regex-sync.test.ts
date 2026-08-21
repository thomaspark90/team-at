import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CARD_COMPANIES, CARD_PAYMENT_RE } from '@/lib/finance/cardOffset';
import { VAT_PAYMENT_RE } from '@/lib/finance/pnl';

// 코드(TS)와 DB 뷰(SQL)의 판정 규칙 동기 가드 (2026-08-21 감사 C1·C2).
// dashboard_tx 뷰의 is_card_payment / is_vat_payment 는 SQL 정규식으로 따로 정의돼 있어,
// 어느 한쪽만 고치면 지표(뷰 경유)와 관리손익(TS 경유)의 카드 상쇄·부가세 제외가 어긋난다.
// 뷰를 재정의하는 새 마이그레이션을 만들면 LATEST_VIEW_MIGRATION 을 그 파일로 갱신할 것.
const LATEST_VIEW_MIGRATION = 'supabase/migrations/20260821021214_dashboard_tx_vat_flag.sql';

describe('카드사·부가세 판정 규칙 — TS와 SQL 뷰 동기', () => {
  const sql = readFileSync(join(process.cwd(), LATEST_VIEW_MIGRATION), 'utf8');

  it('is_card_payment SQL 정규식 = CARD_PAYMENT_RE', () => {
    const pattern = `(${CARD_COMPANIES.join('|')})`;
    expect(CARD_PAYMENT_RE.source).toBe(pattern);
    expect(sql).toContain(`memo ~ '${pattern}'`);
  });

  it('is_vat_payment SQL 정규식 = VAT_PAYMENT_RE', () => {
    expect(sql).toContain(`memo ~ '${VAT_PAYMENT_RE.source}'`);
  });

  it('카드사 목록이 비어 있지 않고 중복이 없다', () => {
    expect(CARD_COMPANIES.length).toBeGreaterThan(0);
    expect(new Set(CARD_COMPANIES).size).toBe(CARD_COMPANIES.length);
  });
});
