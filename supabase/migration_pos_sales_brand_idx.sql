-- 날씨×판매 분석의 브랜드 전체 조회용 인덱스 — (brand, sale_date, id) 선두 컬럼이 brand인
-- 인덱스가 없어 페이지네이션마다 전체 스캔·재정렬이 났다. (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

create index if not exists pos_sales_brand_date_idx
  on finance.pos_sales (brand, sale_date, id);
