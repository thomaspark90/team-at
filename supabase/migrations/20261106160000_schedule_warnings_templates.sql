-- 2026-11-06 대표 지시: 충돌 경고(불가일 포함) · 배포 변경 표시+직원 확인 · 주 템플릿.
-- 1) 근무 불가일 — 연차 기록의 한 종류로 둔다(운영진이 대신 입력). 잔여 연차 계산엔 안 들어간다.
alter table finance.leave_records drop constraint if exists leave_records_type_check;
alter table finance.leave_records add constraint leave_records_type_check
  check (type in ('annual', 'sick', 'off', 'sub_worked', 'sub_off', 'unavailable'));

-- 2) 배포 스냅샷 — 배포 시점의 계획([{d,s,a,b}]). prev 는 직전 배포분. 둘의 차이가 '지난 배포 후 바뀐 칸'.
alter table finance.schedule_weeks add column if not exists snapshot jsonb;
alter table finance.schedule_weeks add column if not exists prev_snapshot jsonb;

-- 3) 직원 확인 — 링크 화면에서 이름을 골라 누른다. published_at 이 바뀌면(재배포) 다시 확인해야 한다.
create table if not exists finance.schedule_publish_acks (
  store text not null check (store in ('pangyo', 'yangjae')),
  week_start date not null,
  staff_id bigint not null references finance.schedule_staff(id) on delete cascade,
  published_at timestamptz not null,
  acked_at timestamptz not null default now(),
  primary key (store, week_start, staff_id)
);
alter table finance.schedule_publish_acks enable row level security;

-- 4) 주 템플릿 — 한 주의 계획을 이름 붙여 저장([{dow(0=화…6=월), s, a, b}]). 불러올 때 퇴사자는 뺀다.
create table if not exists finance.schedule_week_templates (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  name text not null,
  shifts jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (store, name)
);
alter table finance.schedule_week_templates enable row level security;

notify pgrst, 'reload schema';
