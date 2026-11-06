-- 근무자 역할(2026-11-06): 바리스타·파티쉐·콜드파트·핫파트·디쉬 중 여러 개. 키 목록은 lib/schedule/types.ts STAFF_ROLES.
alter table finance.schedule_staff
  add column if not exists roles text[] not null default '{}';
notify pgrst, 'reload schema';
