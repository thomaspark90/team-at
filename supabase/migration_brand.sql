-- 브랜드(가든서비스/스탭밀) 차원 도입 — transactions·pos_sales·inventory·channel_fees. (멱등)
-- 통장·카드·POS가 브랜드별로 분리 운영되므로 데이터 원천 단위로 brand를 귀속한다.
-- 기존 데이터는 전부 가든서비스(garden)로 백필(현재 들어온 신한·우리 통장, 신한카드, POS가 모두 가든).
-- 쿠팡·네이버페이는 두 브랜드가 섞여 있으나 일단 garden — 분리는 2차에서.
-- 값 표기는 transfer_requests.brand 와 동일: 'staffmeal' | 'garden'.
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.

-- ---------- 1) transactions ----------
-- not null default 'garden' → 기존 행 백필 + brand 미지정 insert(은행·카드·엑셀·네이버 기존 경로)는 자동 garden.
alter table finance.transactions
  add column if not exists brand text not null default 'garden'
  check (brand in ('staffmeal','garden'));
create index if not exists transactions_brand_idx on finance.transactions (brand);

-- ---------- 2) pos_sales ----------
alter table finance.pos_sales
  add column if not exists brand text not null default 'garden'
  check (brand in ('staffmeal','garden'));
-- 자연키 교체: (sale_date, category) → (sale_date, category, brand)
-- 두 브랜드가 같은 날·같은 카테고리 매출을 가질 수 있으므로 반드시 brand 포함.
alter table finance.pos_sales drop constraint if exists pos_sales_sale_date_category_key;
do $$ begin
  alter table finance.pos_sales
    add constraint pos_sales_sale_date_category_brand_key unique (sale_date, category, brand);
exception
  when duplicate_table then null;
  when duplicate_object then null;
end $$;

-- ---------- 3) inventory: PK (ym, kind) → (ym, kind, brand) ----------
alter table finance.inventory
  add column if not exists brand text not null default 'garden'
  check (brand in ('staffmeal','garden'));
do $$ begin
  if not exists (
    select 1 from information_schema.key_column_usage
    where table_schema = 'finance' and table_name = 'inventory'
      and constraint_name = 'inventory_pkey' and column_name = 'brand'
  ) then
    alter table finance.inventory drop constraint if exists inventory_pkey;
    alter table finance.inventory add constraint inventory_pkey primary key (ym, kind, brand);
  end if;
end $$;

-- ---------- 4) channel_fees: PK ym → (ym, brand) ----------
alter table finance.channel_fees
  add column if not exists brand text not null default 'garden'
  check (brand in ('staffmeal','garden'));
do $$ begin
  if not exists (
    select 1 from information_schema.key_column_usage
    where table_schema = 'finance' and table_name = 'channel_fees'
      and constraint_name = 'channel_fees_pkey' and column_name = 'brand'
  ) then
    alter table finance.channel_fees drop constraint if exists channel_fees_pkey;
    alter table finance.channel_fees add constraint channel_fees_pkey primary key (ym, brand);
  end if;
end $$;

-- ---------- 5) viewer 뷰 재정의 (brand 컬럼 노출) ----------
-- create or replace 는 컬럼 추가(끝에)만 허용 — 기존 컬럼 순서 유지.
create or replace view finance.dashboard_tx as
  select t.tx_at, t.ym, t.amount_in, t.amount_out, t.category_id, t.brand
  from finance.transactions t
  where finance.my_role() is not null;
grant select on finance.dashboard_tx to authenticated;

create or replace view finance.dashboard_pos as
  select p.sale_date, p.ym, p.category, p.supply, p.brand
  from finance.pos_sales p
  where finance.my_role() is not null;
grant select on finance.dashboard_pos to authenticated;
