-- 교대(맞교환) 요청 + 출퇴근 기록(2026-11-06 대표 결정). 둘 다 직원 링크(토큰)에서 들어오고, 교대 승인은 운영진.
create table if not exists finance.schedule_swap_requests (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  requester_id bigint not null references finance.schedule_staff(id) on delete cascade,
  requester_date date not null,
  target_id bigint not null references finance.schedule_staff(id) on delete cascade,
  target_date date, -- null 이면 맞교환이 아니라 '대신 근무' 부탁
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
alter table finance.schedule_swap_requests enable row level security;
create index if not exists schedule_swap_requests_status_idx on finance.schedule_swap_requests (status, store, requester_date);

create table if not exists finance.schedule_clock_events (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  staff_id bigint not null references finance.schedule_staff(id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null default now()
);
alter table finance.schedule_clock_events enable row level security;
create index if not exists schedule_clock_events_day_idx on finance.schedule_clock_events (store, work_date, staff_id);

-- 출퇴근으로 만들어진 실제 근무는 source='clock'
alter table finance.schedule_shifts drop constraint if exists schedule_shifts_source_check;
alter table finance.schedule_shifts add constraint schedule_shifts_source_check check (source in ('app', 'sheet', 'clock'));
notify pgrst, 'reload schema';
