-- 티칭 일정 시간 단위 세부 스케줄 — 2026-09-09 대표 결정.
-- 일정(시작~종료)을 한 시간 칸으로 쪼개 대표가 칸마다 자유 텍스트 한 줄을 적고, 티칭 스태프는 세로로 읽는다.
-- 칸은 (shift_id, hour) 하나. 빈 텍스트는 행을 지운다(API 에서 처리).

create table if not exists finance.teaching_shift_slots (
  shift_id bigint not null references finance.teaching_shifts(id) on delete cascade,
  hour smallint not null check (hour between 0 and 23),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (shift_id, hour)
);
comment on table finance.teaching_shift_slots is '일정별 시간 칸 메모(대표 입력). 09:00 칸 = hour 9.';

alter table finance.teaching_shift_slots enable row level security;
