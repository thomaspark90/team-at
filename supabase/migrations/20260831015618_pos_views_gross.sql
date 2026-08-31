-- 매출은 총액(VAT 포함)으로 보여준다 — 손익 계산만 공급가액(순액) (2026-08-31 대표 확정).
-- 지금까지 지표·상품 추이의 '매출'이 공급가액이라 토스 POS 화면(실매출, VAT 포함)과 8~9% 어긋나
-- 보였다. 두 뷰에 gross(실판매금액, VAT 포함)를 더해 화면이 총액을 그릴 수 있게 한다.
-- 산식·어느 화면이 어느 기준인지는 docs/finance-formulas.md 가 정본.
-- ⚠ create or replace view 는 컬럼 추가를 '맨 뒤'에서만 허용한다 — 기존 컬럼 순서·이름 유지.

create or replace view finance.dashboard_pos as
  select p.sale_date, p.ym, p.category, p.supply, p.brand, p.store, p.gross
  from finance.pos_sales p
  where (select finance.my_role()) is not null
    and ((select finance.my_brand_scope()) is null or p.brand = (select finance.my_brand_scope()))
union all
  select g.sale_date, g.ym, '식권판매'::text as category,
         round(g.gross / 1.1)::bigint as supply, g.brand, g.store, g.gross
  from finance.pos_gift_sales g
  where (select finance.my_role()) is not null
    and ((select finance.my_brand_scope()) is null or g.brand = (select finance.my_brand_scope()));

create or replace view finance.dashboard_pos_items as
  select p.sale_date, p.ym, p.category, p.product, p.option, p.qty, p.supply, p.brand, p.store, p.gross
  from finance.pos_items p
  where finance.my_role() is not null
    and (finance.my_brand_scope() is null or p.brand = finance.my_brand_scope());

grant select on finance.dashboard_pos, finance.dashboard_pos_items to authenticated;
-- 뷰는 읽기 전용 (2026-08-21 P0 규칙 유지)
revoke insert, update, delete, truncate, references, trigger
  on finance.dashboard_pos, finance.dashboard_pos_items from anon, authenticated;
