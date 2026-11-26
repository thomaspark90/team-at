-- 가든 발주(반복 발주 최저가) 1단계 — 품목표 (2026-11-26 대표 결정, docs/prd-garden-reorder.md).
--   · 품목(reorder_items)은 결제 기록(finance.transactions 의 네이버페이·쿠팡 건)에서 뽑은 후보를 운영진이 승인해 만든다.
--   · match_names = 그 품목으로 묶는 결제 기록 상품명(수령인·'외 n건' 꼬리를 뗀 값). 지난 구매가·판매처는 여기서 계산한다.
--   · 판매처(reorder_sellers)는 하나씩 승인한다. 행이 없는 판매처는 '확인 필요'로 본다.
--   · 버린 후보(reorder_ignored)는 후보 목록에 다시 나오지 않는다.
-- 테이블은 전부 finance.*, RLS 켜고 정책 없음 — API(service role)만 접근. 권한 판정은 lib/reorder/access.ts.

create table if not exists finance.reorder_items (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  name text not null,
  spec_qty numeric check (spec_qty > 0), -- 낱개 하나의 양. g·ml 로 환산해 저장(1kg = 1000). 개수 단위면 1
  spec_unit text check (spec_unit in ('g', 'ml', 'ea')),
  pack_count int not null default 1 check (pack_count > 0), -- 묶음 수(454g × 20개의 20)
  search_query text not null default '',
  must_include text[] not null default '{}',
  exclude_words text[] not null default '{}',
  compare boolean not null default false, -- 최저가 비교 대상인지. 채소·주문제작품은 끈다
  match_names text[] not null default '{}',
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_name text,
  constraint reorder_item_spec check ((spec_qty is null) = (spec_unit is null))
);
comment on table finance.reorder_items is '반복 발주 품목. 지우지 않고 deleted_at 으로 숨긴다.';
create index if not exists reorder_items_store_idx on finance.reorder_items (store) where deleted_at is null;

create table if not exists finance.reorder_sellers (
  id bigserial primary key,
  item_id bigint not null references finance.reorder_items(id) on delete cascade,
  seller_name text not null,
  status text not null default 'pending' check (status in ('trusted', 'pending', 'excluded')),
  shipping_fee int check (shipping_fee >= 0), -- 원. 비어 있으면 '배송비 미확인'
  url text,
  updated_at timestamptz not null default now(),
  updated_by_name text,
  unique (item_id, seller_name)
);
comment on table finance.reorder_sellers is '품목별 판매처 상태 — 믿는 판매처(trusted)·확인 필요(pending)·제외(excluded).';

create table if not exists finance.reorder_ignored (
  store text not null check (store in ('pangyo', 'yangjae')),
  name text not null,
  created_at timestamptz not null default now(),
  created_by_name text,
  primary key (store, name)
);
comment on table finance.reorder_ignored is '품목 후보에서 버린 상품명.';

alter table finance.reorder_items enable row level security;
alter table finance.reorder_sellers enable row level security;
alter table finance.reorder_ignored enable row level security;
grant all on table finance.reorder_items, finance.reorder_sellers, finance.reorder_ignored to service_role;
grant usage, select on sequence finance.reorder_items_id_seq, finance.reorder_sellers_id_seq to service_role;

notify pgrst, 'reload schema';
