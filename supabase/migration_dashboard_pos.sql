-- viewer(팀원)용 대시보드 POS 매출 접근.
-- 대시보드 매출은 POS(발생주의)로 바뀌었는데 pos_sales는 admin/classifier RLS라 viewer는 매출 0으로 보임.
-- → 이름/PII 없는 안전 컬럼(일자·카테고리·공급가액)만 노출하는 '멤버 전용' 뷰를 만들어 viewer도 읽게 함.
-- dashboard_tx 와 동일 패턴: security_invoker 미지정(=뷰 소유자 권한, pos_sales RLS 우회)
--   + WHERE finance.my_role() is not null 로 멤버(admin/classifier/viewer)에게만 노출, 비멤버·anon은 0행.
-- 멱등: create or replace. 프로덕션 SQL Editor에서 1회 실행.

create or replace view finance.dashboard_pos as
  select p.sale_date, p.ym, p.category, p.supply
  from finance.pos_sales p
  where finance.my_role() is not null;

grant select on finance.dashboard_pos to authenticated;
