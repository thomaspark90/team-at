-- dashboard_tx(안전 뷰)에 카드대금↔수집분 이중계상 차감용 신호 추가 (2026-08-20).
-- 지표(aggregate)는 memo 없는 이 뷰만 읽어서, 카드대금 인출(비씨선결제·BC바로·현대 등) 판별을
-- 뷰가 대신 계산해 준다 — memo 원문은 계속 숨긴다(안전 뷰 원칙).
--  · source: 'bank' | 'naverpay' | 'coupang' | 'card' — 수집분 판별
--  · is_card_payment: 은행 카드대금 인출 여부(기재내용 패턴)
-- ⚠️ 아래 정규식은 lib/finance/cardOffset.ts 의 CARD_PAYMENT_RE 와 반드시 동일하게 유지할 것.
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
  (source = 'bank' and memo ~ '(비씨카드|BC바로카드|BC카드|현대카드|신한카드|삼성카드|국민카드|롯데카드|하나카드|우리카드)') as is_card_payment
from finance.transactions t
where finance.my_role() is not null
  and (finance.my_brand_scope() is null or brand = finance.my_brand_scope());
