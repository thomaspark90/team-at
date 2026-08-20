-- dashboard_pos 뷰에 자가 식권 판매 합류 — 2026-08-20.
-- 확정된 회계 기준(대표·매니저 확인): 자가 식권은 사용 시점에 POS에 찍지 않으므로
-- 판매 시점을 매출로 인식한다(이중계상 없음). 지표(aggregate)가 이 뷰로 매출을 읽으므로
-- 식권 판매를 공급가액(÷1.1)으로 환산해 union 한다. 관리손익·전처리3·결산도 동일 기준.
create or replace view finance.dashboard_pos as
select sale_date, ym, category, supply, brand, store
from finance.pos_sales p
where finance.my_role() is not null
  and (finance.my_brand_scope() is null or brand = finance.my_brand_scope())
union all
select sale_date, ym, '식권판매' as category, round(gross / 1.1)::bigint as supply, brand, store
from finance.pos_gift_sales g
where finance.my_role() is not null
  and (finance.my_brand_scope() is null or brand = finance.my_brand_scope());
