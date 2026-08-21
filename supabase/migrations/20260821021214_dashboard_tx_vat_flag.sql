-- dashboard_tx(안전 뷰)에 부가세 납부 판정 신호 추가 (2026-08-21).
-- 관리손익(pnl.ts)은 부가세 납부(예수금 정산)를 손익에서 제외하는데(이중 차감 방지 — 매출이
-- 공급가액 기준), 지표(aggregate)는 memo 없는 이 뷰만 읽어 판정을 못 했다. 카드대금
-- (is_card_payment)과 같은 방식으로 뷰가 대신 계산해 준다 — memo 원문은 계속 숨긴다.
--  · is_vat_payment: 은행 부가가치세 납부/환급 여부(기재내용 패턴, 예: '국세_부가가치세')
-- ⚠️ 아래 패턴은 lib/finance/pnl.ts 의 VAT_PAYMENT_RE 와 반드시 동일하게 유지할 것.
create or replace view finance.dashboard_tx as
select
  tx_at,
  ym,
  amount_in,
  amount_out,
  category_id,
  brand,
  store,
  source,
  (source = 'bank' and memo ~ '(비씨카드|BC바로카드|BC카드|현대카드|신한카드|삼성카드|국민카드|롯데카드|하나카드|우리카드)') as is_card_payment,
  (source = 'bank' and memo ~ '부가가치세') as is_vat_payment
from finance.transactions t
where finance.my_role() is not null
  and (finance.my_brand_scope() is null or brand = finance.my_brand_scope());
