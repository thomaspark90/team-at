-- 직원 링크 열람 기록(2026-11-26) — 배포한 근무표를 실제로 보는지 재는 용도. 누가 봤는지는 모른다(기기별 임의 값만).
create table if not exists finance.schedule_link_views (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  week_start date not null,
  visitor text not null default '',
  viewed_at timestamptz not null default now()
);
alter table finance.schedule_link_views enable row level security;
create index if not exists schedule_link_views_store_idx on finance.schedule_link_views (store, viewed_at desc);
notify pgrst, 'reload schema';
