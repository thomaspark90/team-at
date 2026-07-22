-- 쿠팡 주문내역 자동 수집(무인 스크레이퍼, ~/Projects/coupang-export) 연동 — 스키마 확장 (멱등)
-- Supabase SQL Editor 에 붙여넣고 실행. 여러 번 실행해도 안전.
--
-- 적재 규칙: source='coupang', bank='coupang', tx_at=주문일, memo='쿠팡'(가맹점),
--   channel=상품명 요약+수령인, amount_out=총 결제금액, brand/branch=배송지 판정값.
--   category_id는 학습 규칙(rules) 매칭 시 자동, 아니면 null(미분류).
--
-- 이중계상 방지(집계 정책, 네이버페이와 동일 패턴):
--   쿠팡 결제 자금원은 사업카드 → 카드 이용내역에 '쿠팡' 가맹점 건으로 이미 잡힌다.
--   그 건들을 아래 '쿠팡대체'(손익 제외) 계정으로 분류하면(1회 분류 → 규칙 학습으로 자동)
--   상세 지출은 coupang 건이, 현금 흐름은 카드 건이 각각 한 번씩만 집계된다.
--
-- service_role 권한은 migration_naverpay.sql 에서 이미 부여됨.

-- 1) bank enum에 coupang 추가 (신규 값은 이 실행이 끝난 뒤부터 사용 가능)
alter type finance.bank_source add value if not exists 'coupang';

-- 2) 계정과목: 손익 제외 › 쿠팡대체 (카드의 쿠팡 결제 건 전용)
insert into finance.categories (type, name, in_pnl, sort)
values ('excluded', '쿠팡대체', false, 42)
on conflict (type, name) do nothing;
