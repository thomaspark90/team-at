-- 교육 코멘트 (2026-09-09 대표 지시).
-- 티칭 스태프가 자기 일정의 시간 칸에서 참여 인원마다 "어떻게 받았는지·어디까지 됐는지·다음엔 어떻게"를 남긴다.
--   · level: 1 처음 접함 / 2 연습 필요 / 3 혼자 가능 (null = 미표시)
--   · topics: 이 시간에 다룬 주제 키(lib/teaching/topics.ts). 저장 시 teaching_sessions(+attendees)를 만들어
--     위시리스트 '받음'과 연결한다. 그 세션 id 는 session_ids 에 두고 코멘트를 고치면 갈아 끼운다.
--   · 열람: 대표 + profiles.can_view_comments 가 켜진 계정 + 그 일정의 티칭 스태프 본인. 설정 › 간편 계정에서 대표가 지정.

create table if not exists finance.teaching_slot_comments (
  id bigserial primary key,
  shift_id bigint not null references finance.teaching_shifts(id) on delete cascade,
  hour smallint not null check (hour between 0 and 23),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  level smallint check (level is null or level between 1 and 3),
  topics text[] not null default '{}',
  comment text not null default '',
  session_ids bigint[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, hour, user_id)
);
comment on table finance.teaching_slot_comments is '시간 칸·참여 인원별 교육 코멘트(티칭 스태프 작성). topics 는 받음 처리용 세션과 연결.';
create index if not exists teaching_slot_comments_user_idx on finance.teaching_slot_comments (user_id, updated_at desc);

alter table finance.teaching_slot_comments enable row level security;
grant all on table finance.teaching_slot_comments to service_role;
grant usage, select on sequence finance.teaching_slot_comments_id_seq to service_role;

alter table finance.profiles
  add column if not exists can_view_comments boolean not null default false;
comment on column finance.profiles.can_view_comments is '교육 코멘트 열람 권한(대표가 설정에서 지정). 대표·작성자 본인은 항상 열람.';
