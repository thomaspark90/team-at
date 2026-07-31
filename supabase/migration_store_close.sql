-- 월확정 3단위 전환 — (ym, brand) → (ym, brand, store). (멱등)
-- 2026-07-31 대표 지시: 회계 단위 = 스탭밀 / 가든 양재천점 / 가든 판교점 각각 별도 확정.
--   스탭밀 = (ym, 'staffmeal', '') / 가든 지점 = (ym, 'garden', 'yangjae'|'pangyo').
--   기존 가든 확정 이력(store='')은 두 지점 행으로 복제해 잠금 상태를 유지한 뒤 제거한다.
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전. ⚠️ 앱 배포 전에 먼저 실행할 것.
-- 선행: migration_accounting_split.sql (monthly_close.brand)

alter table finance.monthly_close
  add column if not exists store text not null default ''
  check (store in ('', 'pangyo', 'yangjae'));

do $$ begin
  if not exists (
    select 1 from information_schema.key_column_usage
    where table_schema = 'finance' and table_name = 'monthly_close'
      and constraint_name = 'monthly_close_pkey' and column_name = 'store'
  ) then
    alter table finance.monthly_close drop constraint if exists monthly_close_pkey;
    alter table finance.monthly_close add constraint monthly_close_pkey primary key (ym, brand, store);
  end if;
end $$;

-- 기존 가든 브랜드 단위 행(store='') → 양재천·판교 두 지점 행으로 복제(확정 이력 보존)
insert into finance.monthly_close (ym, brand, store, status, submitted_by, confirmed_by, confirmed_at, updated_at)
  select m.ym, m.brand, s.store, m.status, m.submitted_by, m.confirmed_by, m.confirmed_at, m.updated_at
  from finance.monthly_close m
  cross join (values ('yangjae'), ('pangyo')) as s(store)
  where m.brand = 'garden' and m.store = ''
on conflict (ym, brand, store) do nothing;

delete from finance.monthly_close where brand = 'garden' and store = '';
