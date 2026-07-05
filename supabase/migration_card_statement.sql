-- 사업자카드 이용내역 연동 — 스키마 확장 (멱등)
-- PRD: docs/prd-card-statement.md  ·  정산 UI = B안(정산 스트립 + 내역 미리보기)
-- Supabase SQL Editor 에 붙여넣고 실행. 여러 번 실행해도 안전.

-- 1) transactions: 출처(은행/카드)·카드 식별·할부 표시
--    카드 사용행 규칙: source='card', card_issuer='신한', bank='shinhan'(enum 유지용 발급사 은행),
--    tx_at=사용일, memo=가맹점명, amount_out=사용금액. (통장현황은 source='bank'만 집계해 자동 제외)
alter table finance.transactions add column if not exists source text not null default 'bank';
alter table finance.transactions add column if not exists card_issuer text;
alter table finance.transactions add column if not exists is_installment boolean not null default false;
create index if not exists transactions_source_idx on finance.transactions (source);

-- 2) uploads: 카드 이용내역 배치 ↔ 은행 '카드결제' 건 정산 링크
alter table finance.uploads add column if not exists source text not null default 'bank';
alter table finance.uploads add column if not exists card_issuer text;
alter table finance.uploads add column if not exists settled_tx_id bigint references finance.transactions(id);
alter table finance.uploads add column if not exists statement_total bigint;

-- 3) 계정과목: 손익 제외 › 카드대금정산 (은행 카드결제 lump 전용, in_pnl=false)
insert into finance.categories (type, name, in_pnl, sort)
values ('excluded', '카드대금정산', false, 40)
on conflict (type, name) do nothing;

-- 참고(집계 규칙, 코드에서 적용):
--   통장 현황(현금)  = source='bank' 만
--   자금 흐름(손익)  = source='card'(분류) + source='bank' 중 손익제외(카드대금정산 포함) 제외
--   중복방지: 카드결제 lump이 이용내역과 '연결(settled_tx_id)'되면 카드대금정산으로 잠겨 손익에서 빠짐
