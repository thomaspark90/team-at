-- 연차 신청 — 지금은 운영진이 대신 접수(2026-11-06 대표 결정), 나중에 직원 계정이 생기면 source='app' 으로 같은 표에 쌓인다.
-- 승인하면 leave_records 에 기록이 생기고 잔여에서 빠진다. 반려는 기록 없이 상태만 남긴다.
create table if not exists finance.leave_requests (
  id bigserial primary key,
  staff_id bigint not null references finance.schedule_staff(id) on delete cascade,
  leave_date date not null,
  type text not null default 'annual' check (type in ('annual', 'sick', 'off')),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'editor' check (source in ('editor', 'link', 'app')),
  requested_by text,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text not null default ''
);
alter table finance.leave_requests enable row level security;
create index if not exists leave_requests_status_idx on finance.leave_requests (status, leave_date);
notify pgrst, 'reload schema';
