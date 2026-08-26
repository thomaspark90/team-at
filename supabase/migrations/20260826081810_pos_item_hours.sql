-- 시간대별 품목 판매(pos_item_hours) — 전처리5 '시간대별 판매' 용 (2026-08-26).
--
-- 왜: pos_items 는 (일×카테고리×상품×옵션) 집계라 '몇 시에 팔렸는지'가 없다. 토스 리포트엔
-- '주문시작시각'이 있는데 파서가 버리고 있었다. 가든 양재천 '브런치바'(그램 단위 판매)를
-- 시간대별 판매 건수·평균 그램으로 봐야 한다는 요구(2026-08-26 대표)에서 신설.
--
-- list_price(상품가격=정가 합)를 따로 담는 이유: 그램은 '정가 ÷ 그램당 단가'로 역산하는데,
-- 할인·선불권 결제 행은 실판매금액(gross)이 깎이거나 0이라 gross 로 재면 담은 양이 사라진다
-- (2026-08 실측: 전체할인 16건 · 선불권 10건). 매출은 gross, 그램은 list_price 로 각각 본다.
--
-- 시각은 영업일(주문기준일자) + 주문시작시각의 '시'로 버킷한다 — 자정 넘긴 주문은 영업일에
-- 그대로 붙고 hour 만 0~2시로 잡힌다(POS 영업일 규칙과 동일).
create table if not exists finance.pos_item_hours (
  id          bigserial primary key,
  ym          text not null,                 -- 'YYYY-MM' (sale_date 기준)
  sale_date   date not null,                 -- 주문기준일자(영업일)
  hour        smallint not null check (hour between 0 and 23),
  brand       text not null default 'garden' check (brand in ('staffmeal', 'garden')),
  store       text not null default ''       check (store in ('', 'pangyo', 'yangjae')),
  category    text not null,
  product     text not null,
  option      text not null default '',
  qty         numeric not null default 0,    -- 수량 합(취소는 음수 그대로 net)
  orders      integer not null default 0,    -- 이 버킷 안의 서로 다른 주문번호 수
  list_price  bigint not null default 0,     -- 상품가격(정가, 할인 전) 합 — 그램 역산 기준
  gross       bigint not null default 0,     -- 실판매금액 합(VAT 포함)
  vat         bigint not null default 0,
  supply      bigint not null default 0,     -- 공급가액 = gross − vat
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique (sale_date, hour, brand, store, category, product, option) -- 월 단위 교체 + 자연 dedup
);
create index if not exists pos_item_hours_ym_idx on finance.pos_item_hours (ym);
create index if not exists pos_item_hours_unit_idx on finance.pos_item_hours (brand, store, sale_date);

alter table finance.pos_item_hours enable row level security;

drop policy if exists "pos_item_hours rw" on finance.pos_item_hours;
create policy "pos_item_hours rw" on finance.pos_item_hours for all
  using ((select finance.my_role()) in ('admin', 'classifier'))
  with check ((select finance.my_role()) in ('admin', 'classifier'));

-- viewer 포함 재무 멤버 열람용 — dashboard_pos_items 와 같은 접근 조건
create or replace view finance.dashboard_pos_item_hours as
  select p.sale_date, p.ym, p.hour, p.category, p.product, p.option,
         p.qty, p.orders, p.list_price, p.gross, p.supply, p.brand, p.store
  from finance.pos_item_hours p
  where finance.my_role() is not null
    and (finance.my_brand_scope() is null or p.brand = finance.my_brand_scope());

grant select on finance.dashboard_pos_item_hours to authenticated;
grant all on table finance.pos_item_hours to authenticated;
grant all on table finance.pos_item_hours to service_role;
grant all on sequence finance.pos_item_hours_id_seq to authenticated;
grant all on sequence finance.pos_item_hours_id_seq to service_role;

-- 뷰는 읽기 전용 — SELECT 외 권한 회수(2026-08-21 P0 규칙과 동일)
revoke insert, update, delete, truncate, references, trigger
  on finance.dashboard_pos_item_hours from anon, authenticated;
