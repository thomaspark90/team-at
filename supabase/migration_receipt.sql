-- 쿠팡 매출전표 품목 보강(분해) — 스키마 확장 (멱등)
-- PRD: docs/prd-card-statement.md 연장. 카드 쿠팡 lump → 영수증 품목으로 분해.
-- Supabase SQL Editor 에 붙여넣고 Run.

-- 카드 승인번호(영수증 ↔ 카드 거래 조인 키)
alter table finance.transactions add column if not exists approval_no text;
create index if not exists transactions_approval_idx on finance.transactions (approval_no);

-- 품목 분해된 원본 카드 건을 손익에서 제외(품목 행이 대체) — 카드대금정산과 같은 원리
insert into finance.categories (type, name, in_pnl, sort)
values ('excluded', '영수증분해', false, 41)
on conflict (type, name) do nothing;
