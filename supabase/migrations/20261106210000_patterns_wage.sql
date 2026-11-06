-- 고정 근무 패턴(사람·지점·요일 → 시간) + 시급(월 집계 예상 인건비, 파트타이머용). 2026-11-06 대표 결정.
create table if not exists finance.schedule_staff_patterns (
  staff_id bigint not null references finance.schedule_staff(id) on delete cascade,
  store text not null check (store in ('pangyo', 'yangjae')),
  dow smallint not null check (dow between 0 and 6), -- 0=화 … 6=월(주 시작 기준)
  start_min int not null,
  end_min int not null,
  updated_at timestamptz not null default now(),
  primary key (staff_id, store, dow),
  constraint schedule_pattern_time check (start_min >= 0 and end_min <= 1440 and start_min < end_min and start_min % 30 = 0 and end_min % 30 = 0)
);
alter table finance.schedule_staff_patterns enable row level security;
alter table finance.schedule_staff add column if not exists hourly_wage int check (hourly_wage is null or hourly_wage >= 0);
notify pgrst, 'reload schema';
