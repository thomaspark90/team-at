-- 네이버페이 결제내역 자동 수집(무인 스크레이퍼) 연동 — 스키마 확장 (멱등)
-- Supabase SQL Editor 에 붙여넣고 실행. 여러 번 실행해도 안전.
--
-- 적재 규칙: source='naverpay', bank='naverpay', tx_at=결제일시,
--   memo=가맹점명(분류 단서), channel=상품명(참고 표시), amount_out=결제금액.
--   category_id는 학습 규칙(rules) 매칭 시 자동, 아니면 null(미분류)로 들어와
--   기존 거래 분류 화면에서 매니저가 분류·확정한다.
--
-- 이중계상 방지(집계 정책, 카드대금정산과 동일 패턴):
--   네이버페이 결제 자금원은 (a) 사업카드 → 카드 이용내역에 '네이버페이' 가맹점 건으로,
--   (b) 네이버페이 머니 충전 → 통장에 '네이버파이낸셜' 출금으로 이미 잡힌다.
--   그 건들을 아래 '네이버페이대체'(손익 제외) 계정으로 분류하면(1회 분류 → 규칙 학습으로 자동)
--   상세 지출은 naverpay 건이, 현금 흐름은 은행 건이 각각 한 번씩만 집계된다.

-- 1) bank enum에 naverpay 추가 (신규 값은 이 실행이 끝난 뒤부터 사용 가능)
alter type finance.bank_source add value if not exists 'naverpay';

-- 2) 계정과목: 손익 제외 › 네이버페이대체 (카드/은행의 네이버페이 결제·충전 건 전용)
insert into finance.categories (type, name, in_pnl, sort)
values ('excluded', '네이버페이대체', false, 41)
on conflict (type, name) do nothing;
