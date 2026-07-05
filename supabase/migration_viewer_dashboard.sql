-- viewer(팀원)용 대시보드 데이터 접근.
-- viewer는 raw transactions RLS로 막혀 있어(이름 등 민감정보 보호) 대시보드를 못 봄.
-- → 이름(memo) 없는 안전 컬럼만 노출하는 '멤버 전용' 뷰를 만들어 그것만 읽게 함.
-- security_invoker 미지정(=뷰 소유자 권한으로 실행) → 기반 tx RLS를 우회하되,
-- WHERE finance.my_role() is not null 로 멤버(admin/classifier/viewer)에게만 전체 행 노출.
-- 비멤버·anon은 my_role()=null → 0행. 모든 달 포함(확정 여부 무관).
-- 멱등: create or replace. 프로덕션 SQL Editor에서 1회 실행.

create or replace view finance.dashboard_tx as
  select t.tx_at, t.ym, t.amount_in, t.amount_out, t.category_id
  from finance.transactions t
  where finance.my_role() is not null;

grant select on finance.dashboard_tx to authenticated;
