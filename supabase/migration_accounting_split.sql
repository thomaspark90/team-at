-- 브랜드·지점 회계 완전분리 1단계 — store 차원 + 건별 분할 + 브랜드별 월확정. (멱등)
-- 2026-07-28 grill 확정 설계:
--   회계 단위 3개 = 스탭밀 / 가든-판교(pangyo) / 가든-양재천(yangjae). store 는 가든에만 의미(스탭밀·미지정 = null).
--   공통 매입은 건별 분할(원본을 excluded›건별분할로 잠그고 자식 행으로 쪼갬) — 월 배분 엔진 없음.
--   월확정은 브랜드별(가든/스탭밀 각각 잠금).
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전. ⚠️ 앱 배포 전에 먼저 실행할 것.

-- ---------- 1) transactions.store — 매장 지점 차원 ----------
-- 기존 branch 컬럼은 의미가 오염됨(은행 행=신한 거래점명, 쿠팡·네이버 행=배송지 지점명)이라 별도 컬럼.
alter table finance.transactions
  add column if not exists store text
  check (store is null or store in ('pangyo','yangjae'));
create index if not exists transactions_store_idx on finance.transactions (store);

-- 쿠팡·네이버 수집분은 배송지 판정(branch)으로 store 백필.
-- source 조건 필수 — 은행 행의 branch 는 은행 지점명이라 '판교' 등과 우연히 겹칠 수 있다.
update finance.transactions set store = 'pangyo'
  where store is null and source in ('coupang','naverpay') and branch = '판교';
update finance.transactions set store = 'yangjae'
  where store is null and source in ('coupang','naverpay') and branch = '양재천';

-- ---------- 2) 건별 분할 ----------
-- 패턴은 영수증분해와 동일: 원본을 excluded›건별분할로 잠그고(손익 제외), 자식 행들이 손익에 잡힌다.
-- 자식 행은 split_parent_id 로 원본을 가리키며, 원본 삭제 시 함께 삭제(cascade).
alter table finance.transactions
  add column if not exists split_parent_id bigint references finance.transactions(id) on delete cascade;
create index if not exists transactions_split_parent_idx on finance.transactions (split_parent_id);

insert into finance.categories (type, name, in_pnl, vat_taxable)
  values ('excluded', '건별분할', false, false)
  on conflict (type, name) do nothing;

-- 분할 비율 학습 — 같은 거래처(정규화 키)는 다음부터 자동 제안.
-- allocations 예: [{"brand":"garden","store":"yangjae","ratio":0.6},{"brand":"garden","store":"pangyo","ratio":0.4}]
create table if not exists finance.split_rules (
  id             bigserial primary key,
  normalized_key text not null,
  brand          text not null default 'garden' check (brand in ('staffmeal','garden')), -- 원거래 브랜드
  allocations    jsonb not null,
  created_by     uuid references auth.users(id),
  hit_count      int not null default 0,
  created_at     timestamptz not null default now(),
  unique (normalized_key, brand)
);
alter table finance.split_rules enable row level security;
drop policy if exists "split rules rw" on finance.split_rules;
create policy "split rules rw" on finance.split_rules for all
  using (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()))
  with check (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()));

-- ---------- 3) monthly_close: PK ym → (ym, brand) — 브랜드별 확정 ----------
-- 기존 확정 이력은 사실상 가든 데이터 기준이었으므로 garden 백필. 스탭밀은 행 없음 = open.
alter table finance.monthly_close
  add column if not exists brand text not null default 'garden'
  check (brand in ('staffmeal','garden'));
do $$ begin
  if not exists (
    select 1 from information_schema.key_column_usage
    where table_schema = 'finance' and table_name = 'monthly_close'
      and constraint_name = 'monthly_close_pkey' and column_name = 'brand'
  ) then
    alter table finance.monthly_close drop constraint if exists monthly_close_pkey;
    alter table finance.monthly_close add constraint monthly_close_pkey primary key (ym, brand);
  end if;
end $$;

-- ---------- 4) pos_sales.store — 지점별 매출 ----------
-- 가든은 지점 필수(판교=페이히어, 양재천=토스), 스탭밀은 단일 매장이라 '' 유지.
-- not null default '' 로 두어 유니크 제약에 바로 포함(널 유니크 함정 회피).
alter table finance.pos_sales
  add column if not exists store text not null default ''
  check (store in ('', 'pangyo', 'yangjae'));

-- 기존 가든 POS 데이터는 전부 토스(양재천) 업로드분.
update finance.pos_sales set store = 'yangjae' where brand = 'garden' and store = '';

-- 자연키 교체: (sale_date, category, brand) → (sale_date, category, brand, store)
alter table finance.pos_sales drop constraint if exists pos_sales_sale_date_category_brand_key;
do $$ begin
  alter table finance.pos_sales
    add constraint pos_sales_sale_date_category_brand_store_key unique (sale_date, category, brand, store);
exception
  when duplicate_table then null;
  when duplicate_object then null;
end $$;

-- ---------- 5) viewer 뷰에 store 노출 (끝에 컬럼 추가 — 기존 순서 유지, 스코프 조건 유지) ----------
create or replace view finance.dashboard_tx as
  select t.tx_at, t.ym, t.amount_in, t.amount_out, t.category_id, t.brand, t.store
  from finance.transactions t
  where finance.my_role() is not null
    and (finance.my_brand_scope() is null or t.brand = finance.my_brand_scope());
grant select on finance.dashboard_tx to authenticated;

create or replace view finance.dashboard_pos as
  select p.sale_date, p.ym, p.category, p.supply, p.brand, p.store
  from finance.pos_sales p
  where finance.my_role() is not null
    and (finance.my_brand_scope() is null or p.brand = finance.my_brand_scope());
grant select on finance.dashboard_pos to authenticated;

-- ---------- 6) monthly_category_totals: 브랜드 차원 반영 (앱 미사용 뷰 — 안전 재정의) ----------
drop view if exists finance.monthly_category_totals;
create view finance.monthly_category_totals
  with (security_invoker = true) as
  select t.ym, t.brand, c.type, c.name as category,
         sum(t.amount_in) as total_in, sum(t.amount_out) as total_out
  from finance.transactions t
  join finance.categories c on c.id = t.category_id
  join finance.monthly_close m on m.ym = t.ym and m.brand = t.brand
  where m.status = 'confirmed'
  group by t.ym, t.brand, c.type, c.name;
