-- 멤버 브랜드 스코프(권한 분리 2차) — 스탭밀 담당자는 스탭밀 거래만 보고 분류. (멱등)
-- members.brand_scope: null = 전체(기존과 동일) | 'staffmeal' | 'garden' — 값 표기는 transactions.brand 와 동일.
-- 화면 필터가 아니라 RLS 로 강제: 스코프가 있으면 transactions 읽기/쓰기와 대시보드 뷰가 해당 brand 행으로 제한된다.
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
-- ⚠️ 앱 코드(resolveMember)가 brand_scope 컬럼을 조회하므로 반드시 앱 배포 전에 먼저 실행할 것.

alter table finance.members
  add column if not exists brand_scope text
  check (brand_scope is null or brand_scope in ('staffmeal','garden'));

-- 현재 사용자의 브랜드 스코프 (RLS 헬퍼). OWNER·스코프 없는 멤버는 null = 전체.
create or replace function finance.my_brand_scope() returns text
  language sql stable security definer set search_path = finance, public as $$
  select case
    when (select email from auth.users where id = auth.uid()) = 'thomas.in.park@gmail.com'
      then null
    else (select brand_scope from finance.members where id = auth.uid())
  end
$$;

-- transactions 정책 교체 — 역할 판정에 스코프 조건 추가 (스코프 null 이면 기존과 동일).
drop policy if exists "tx read" on finance.transactions;
create policy "tx read" on finance.transactions for select
  using (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()));

drop policy if exists "tx write" on finance.transactions;
create policy "tx write" on finance.transactions for all
  using (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()))
  with check (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()));

-- viewer 대시보드 뷰도 스코프 반영 (컬럼 구성은 migration_brand.sql 과 동일 유지).
create or replace view finance.dashboard_tx as
  select t.tx_at, t.ym, t.amount_in, t.amount_out, t.category_id, t.brand
  from finance.transactions t
  where finance.my_role() is not null
    and (finance.my_brand_scope() is null or t.brand = finance.my_brand_scope());
grant select on finance.dashboard_tx to authenticated;

create or replace view finance.dashboard_pos as
  select p.sale_date, p.ym, p.category, p.supply, p.brand
  from finance.pos_sales p
  where finance.my_role() is not null
    and (finance.my_brand_scope() is null or p.brand = finance.my_brand_scope());
grant select on finance.dashboard_pos to authenticated;
