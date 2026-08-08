-- dashboard_pos 뷰에 store(지점) 컬럼 추가 — viewer 멤버도 가든 매출을 지점 구분으로 본다.
-- 기존에는 pos_sales 직조회(admin/classifier RLS)만 store 를 볼 수 있어 /garden/sales 가
-- viewer 에게 전체 합만 보여줬다. create or replace view 는 끝에 컬럼 추가만 허용되므로
-- store 를 마지막에 붙인다(기존 컬럼 순서 유지). 접근 조건은 기존과 동일.
create or replace view finance.dashboard_pos as
  select p.sale_date, p.ym, p.category, p.supply, p.brand, p.store
  from finance.pos_sales p
  where finance.my_role() is not null
    and (finance.my_brand_scope() is null or p.brand = finance.my_brand_scope());

grant select on finance.dashboard_pos to authenticated;
