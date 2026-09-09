-- 티칭 일정에 시간·교육 대상 추가 — 2026-09-09 대표 결정.
-- 티칭 스태프(7~8년차 바리스타)가 로그인하면 "몇 일(요일) 몇 시에 어느 지점에서 누구를 가르치는지"를 보게 한다.
-- 대표가 설정 없이 교육 탭에서 날짜·시간·지점·티칭 스태프·교육 대상 스탭을 한 번에 등록한다.
-- 기존 일정(시간 없음)은 그대로 유효 — start_time/end_time 은 nullable.

alter table finance.teaching_shifts
  add column if not exists start_time time,
  add column if not exists end_time time;

comment on column finance.teaching_shifts.start_time is '출근(교육 시작) 시각 KST, 선택';
comment on column finance.teaching_shifts.end_time is '교육 종료 시각 KST, 선택';

create table if not exists finance.teaching_shift_trainees (
  shift_id bigint not null references finance.teaching_shifts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (shift_id, user_id)
);
comment on table finance.teaching_shift_trainees is '일정별 교육 대상 스탭. 대표가 지정. 비어 있으면 화면은 "지정 없음"으로 표시.';
create index if not exists teaching_shift_trainees_user_idx on finance.teaching_shift_trainees (user_id);

alter table finance.teaching_shift_trainees enable row level security;
