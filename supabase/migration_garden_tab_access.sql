-- 가든 하위 탭 접근 권한 — 사용자별 허용 탭 목록. (멱등)
-- 행이 없으면 전체 탭 허용(기존과 동일). OWNER 는 항상 전체.
-- 관리는 /garden/settings 의 '가든 탭 권한' 섹션(admin 전용, API가 service role 로 수행).
-- 탭 키: dashboard, pricing, recipes, recommended, calibration, beancard, reviews, words, settings
--        (lib/garden/tabs.ts 의 GARDEN_TAB_KEYS 와 동일하게 유지할 것)

create table if not exists finance.garden_tab_access (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  tabs       text[] not null,                    -- 허용 탭 키 목록
  updated_at timestamptz not null default now()
);

alter table finance.garden_tab_access enable row level security;

-- 본인 행 읽기만 허용 — 쓰기는 API(service role) 전용
drop policy if exists "own garden tab access" on finance.garden_tab_access;
create policy "own garden tab access" on finance.garden_tab_access
  for select using (user_id = auth.uid());

grant usage on schema finance to service_role;
grant all on all tables in schema finance to service_role;
