-- 자가 식권(선불 식권·상품권) 판매 저장 — 2026-08-20.
--
-- 식권 판매는 선수금이라 POS 매출(pos_sales)에서 제외하는데, 지금까지는 파서가 excluded 로
-- 집계만 하고 버려서 규모를 화면 어디서도 볼 수 없었다. 보정 정산률이 100%를 넘는 주 원인
-- (카드 입금엔 포함·POS 매출엔 없음, 2025년 1.17억 실측)인데도 "월 900만원 규모 추정"이라는
-- 문구로만 남아 있던 것. 이 테이블은 판매(선수금 유입)를 날짜·상품 단위로 담는다.
--
-- 한계(의도된 범위): 사용(차감)분은 담지 않는다 — 자가 식권이 지류라 사용 시 POS 결제수단
-- '기타'로만 찍혀 식권대장(B2B) 결제와 구분할 수 없다('선불권 사용' 열은 전 기간 0 실측).
-- 그래서 이 테이블로 잔액(부채)을 계산하면 안 되고, 유입 흐름만 본다.

create table if not exists finance.pos_gift_sales (
  id bigint generated always as identity primary key,
  ym text not null,
  sale_date date not null,
  brand text not null,
  store text not null default '',
  item text not null default '',
  qty numeric not null default 0,
  gross numeric not null default 0, -- 실매출(할인 반영·VAT 포함) — pos_sales.gross 와 같은 기준
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  unique (sale_date, brand, store, item)
);

create index if not exists pos_gift_sales_ym_idx on finance.pos_gift_sales (brand, store, ym);

alter table finance.pos_gift_sales enable row level security;

drop policy if exists "pos_gift_sales rw" on finance.pos_gift_sales;
create policy "pos_gift_sales rw" on finance.pos_gift_sales for all
  using (finance.my_role() in ('admin','classifier'))
  with check (finance.my_role() in ('admin','classifier'));
