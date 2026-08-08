-- 품목 단위 POS 매출(pos_items) — 메뉴×옵션 주별 추이 리포트용 (2026-08-08).
-- pos_sales(일×카테고리 집계)는 그대로 두고, 토스 '상품 주문 상세내역'의
-- (일×카테고리×상품명×옵션) 단위를 별도 테이블로 쌓는다.
-- 페이히어(판교·스탭밀)는 결제 단위 리포트라 품목 행을 만들 수 없어 아직 비어 있다
-- (파서가 items 를 반환하지 않음). 상품별 리포트 확보 후 같은 테이블로 확장 예정.
create table if not exists finance.pos_items (
  id          bigserial primary key,
  ym          text not null,                 -- 'YYYY-MM' (sale_date 기준)
  sale_date   date not null,                 -- 주문기준일자(발생주의)
  brand       text not null default 'garden' check (brand in ('staffmeal', 'garden')),
  store       text not null default ''       check (store in ('', 'pangyo', 'yangjae')),
  category    text not null,                 -- COFFEE / BAKERY / …
  product     text not null,                 -- 상품명 (예: 아메리카노)
  option      text not null default '',      -- 옵션 원문 (예: Ice / 스테이)
  qty         numeric not null default 0,
  gross       bigint not null default 0,     -- 실판매금액 합(VAT 포함)
  vat         bigint not null default 0,
  supply      bigint not null default 0,     -- 공급가액 = gross − vat
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique (sale_date, brand, store, category, product, option) -- 월 단위 교체 + 자연 dedup
);
create index if not exists pos_items_ym_idx on finance.pos_items (ym);

alter table finance.pos_items enable row level security;

drop policy if exists "pos_items rw" on finance.pos_items;
create policy "pos_items rw" on finance.pos_items for all
  using (finance.my_role() in ('admin', 'classifier'))
  with check (finance.my_role() in ('admin', 'classifier'));

-- viewer 포함 재무 멤버 열람용 뷰 — dashboard_pos 와 같은 접근 조건(my_role/brand_scope)
create or replace view finance.dashboard_pos_items as
  select p.sale_date, p.ym, p.category, p.product, p.option, p.qty, p.supply, p.brand, p.store
  from finance.pos_items p
  where finance.my_role() is not null
    and (finance.my_brand_scope() is null or p.brand = finance.my_brand_scope());

grant select on finance.dashboard_pos_items to authenticated;

-- 베이스라인과 같은 테이블별 명시 grant 패턴 (RLS 가 실제 접근을 통제)
grant all on table finance.pos_items to authenticated;
grant all on table finance.pos_items to service_role;
grant all on sequence finance.pos_items_id_seq to authenticated;
grant all on sequence finance.pos_items_id_seq to service_role;
