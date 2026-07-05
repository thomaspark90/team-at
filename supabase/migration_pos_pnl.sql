-- 토스 POS 매출 연동 & 관리손익(발생주의) — 스키마 확장 (멱등)
-- PRD: docs/prd-pos-pnl.md
-- Supabase SQL Editor 에 붙여넣고 실행. 여러 번 실행해도 안전.
--
-- 집계 규칙(코드에서 적용):
--   pos_sales = 토스 '상품 주문 상세내역'의 (일×카테고리) 발생주의 매출.
--     상품권(금액권별/선불권) 제외, 취소(음수) net, supply=gross−vat(공급가액).
--     재업로드 시 해당 ym 전부 삭제 후 재삽입(월 단위 교체).
--   관리손익 매출 = Σ supply, 재료비=거래분류(cogs) 매입 ± inventory(기말재고).

-- ---------- 1) POS 매출(일×카테고리 집계) ----------
create table if not exists finance.pos_sales (
  id          bigserial primary key,
  ym          text not null,                 -- 'YYYY-MM' (sale_date 기준)
  sale_date   date not null,                 -- 주문기준일자(발생주의)
  category    text not null,                 -- COFFEE / BAKERY / FRUIT / BEVERAGE / TEA …
  qty         numeric not null default 0,
  gross       bigint not null default 0,     -- 실판매금액 합(VAT 포함)
  vat         bigint not null default 0,     -- 부가세액 합
  supply      bigint not null default 0,     -- 공급가액 = gross − vat
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique (sale_date, category)               -- 월 단위 교체 + 자연 dedup
);
create index if not exists pos_sales_ym_idx on finance.pos_sales (ym);

-- ---------- 2) 월별 기말재고(재료비 발생주의 보정) ----------
--   재료비(그달) = 기초(전월 같은 kind 기말) + 당월매입 − 기말.
create table if not exists finance.inventory (
  ym          text not null,                 -- 'YYYY-MM'
  kind        text not null check (kind in ('식자재','포장소모품')),
  amount      bigint not null default 0,     -- 월말 재고 평가액
  entered_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  primary key (ym, kind)
);

-- ---------- RLS ----------
alter table finance.pos_sales enable row level security;
alter table finance.inventory enable row level security;

drop policy if exists "pos_sales rw" on finance.pos_sales;
create policy "pos_sales rw" on finance.pos_sales for all
  using (finance.my_role() in ('admin','classifier'))
  with check (finance.my_role() in ('admin','classifier'));

drop policy if exists "inventory rw" on finance.inventory;
create policy "inventory rw" on finance.inventory for all
  using (finance.my_role() in ('admin','classifier'))
  with check (finance.my_role() in ('admin','classifier'));
