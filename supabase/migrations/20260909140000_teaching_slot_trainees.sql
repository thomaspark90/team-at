-- 시간 칸별 참여 인원 (2026-09-09 대표 지시).
-- 왜: 일정 전체를 지점 스탭 전원이 들으면 매장 운영에 구멍이 나고 불필요한 교육을 받는 사람이 생긴다.
-- 한 시간 칸마다 그 시간에 들어올 사람만 고른다. 칸 메모(teaching_shift_slots)와 별도 테이블 —
-- 메모가 비어도 인원은 남는다. 헤더의 교육 대상·전날 알림은 칸 인원의 합집합을 우선한다.

create table if not exists finance.teaching_shift_slot_trainees (
  shift_id bigint not null references finance.teaching_shifts(id) on delete cascade,
  hour smallint not null check (hour between 0 and 23),
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (shift_id, hour, user_id)
);
comment on table finance.teaching_shift_slot_trainees is '일정 시간 칸별 참여 스탭(대표 지정). 09:00 칸 = hour 9.';
create index if not exists teaching_shift_slot_trainees_user_idx on finance.teaching_shift_slot_trainees (user_id);

alter table finance.teaching_shift_slot_trainees enable row level security;
grant all on table finance.teaching_shift_slot_trainees to service_role;
