-- RLS 성능 — my_role()/my_brand_scope() 를 스칼라 서브쿼리로 감싸 쿼리당 1회(InitPlan)만 평가.
--
-- 배경(2026-08-23): 지표 페이지가 statement timeout(authenticated 8s)으로 죽음. 원인은
-- 정책·대시보드 뷰가 `finance.my_role() = any(...)` 형태로 함수를 직접 불러, STABLE 임에도
-- **행마다** 실행된 것 — 통장 거래 9,781행 조회 하나가 함수 4만 회 호출(631ms, 버퍼 39,536).
-- 지표는 이런 전량 조회를 8개 병렬로 쏘고 raw_rows(5.7만행)·pos_items(2만행)도 같은 패턴이라,
-- 부하가 겹치면 8초를 넘겼다. 처방은 Supabase 표준: `(select finance.my_role())` 로 감싸면
-- 플래너가 InitPlan 으로 뽑아 쿼리당 1회만 평가한다. 의미(보안 판정)는 동일하다.
--
-- finance 스키마 전체 정책의 qual/with_check 를 일괄 재작성한다 — 새 정책이 늘어도 다시
-- 실행하면 멱등(이미 감싼 호출은 (SELECT ...) 형태라 패턴에 안 걸린다).

do $$
declare
  p record;
  new_qual text;
  new_check text;
  cmd text;
begin
  for p in
    select pol.oid, pol.polname, pol.polrelid::regclass as tbl,
           pg_get_expr(pol.polqual, pol.polrelid) as qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as chk
      from pg_policy pol
     where pol.polrelid::regclass::text like 'finance.%'
       and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~ 'finance\.(my_role|my_brand_scope)\(\)'
         or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'finance\.(my_role|my_brand_scope)\(\)')
  loop
    -- 이미 (SELECT finance.my_role()) 로 감싼 호출은 건드리지 않는다(역참조로 앞글자 검사)
    new_qual := regexp_replace(p.qual, '(?<!SELECT )finance\.(my_role|my_brand_scope)\(\)', '( SELECT finance.\1() )', 'g');
    new_check := regexp_replace(p.chk, '(?<!SELECT )finance\.(my_role|my_brand_scope)\(\)', '( SELECT finance.\1() )', 'g');
    cmd := format('alter policy %I on %s', p.polname, p.tbl);
    if new_qual is not null then cmd := cmd || format(' using (%s)', new_qual); end if;
    if new_check is not null then cmd := cmd || format(' with check (%s)', new_check); end if;
    execute cmd;
  end loop;
end $$;

-- 대시보드 안전 뷰 4종 — WHERE 절의 함수 호출도 행마다 평가되므로 같은 방식으로 재생성.
-- (뷰는 owner 권한으로 실행돼 원본 테이블 RLS 를 타지 않고 이 WHERE 가 유일한 관문 — 의미 유지)
do $$
declare
  v text;
  def text;
begin
  foreach v in array array['dashboard_tx', 'dashboard_pos', 'dashboard_pos_items', 'dashboard_lumps']
  loop
    def := pg_get_viewdef(format('finance.%I', v)::regclass, true);
    def := regexp_replace(def, '(?<!SELECT )finance\.(my_role|my_brand_scope)\(\)', '( SELECT finance.\1() )', 'g');
    execute format('create or replace view finance.%I as %s', v, def);
  end loop;
end $$;
