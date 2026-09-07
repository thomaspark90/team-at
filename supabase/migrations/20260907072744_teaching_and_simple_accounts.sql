-- 간편 계정(이름 + 6자리 비밀번호) 프로필 + 매니저 교육 기능 (2026-09-07 대표 결정).
--
-- 왜: 바리스타 7년차 매니저들이 주 1~2일 판교·양재천에 출근해 스탭 교육을 한다.
-- 스탭이 배우고 싶은 주제를 고르고(위시리스트), 매니저는 자기 출근 일정을 등록하고
-- 그날 지점의 요청을 보고 가르친 뒤 "교육함"을 남긴다. 스탭·매니저 모두 구글 워크스페이스
-- 계정이 없어 대표가 설정에서 이름·지점·역할로 계정을 발급하는 간편 로그인을 얹는다.
--
-- 구조:
--   · finance.profiles           계정 프로필(표시 이름·지점·역할·간편 로그인 상태). 대표(OWNER)는 행 없이 admin.
--   · finance.teaching_wishes    스탭 위시(주제 키는 코드 상수 lib/teaching/topics.ts).
--                                requested_at 이후 참석 기록이 있으면 '받음'으로 본다 — 재요청은 requested_at 갱신.
--   · finance.teaching_notes     스탭 자유 서술 1칸.
--   · finance.teaching_shifts    매니저 출근 일정(날짜·지점). 매니저 본인 입력, 대표 수정 가능.
--   · finance.teaching_sessions  "교육함" 기록(주제·날짜·지점·매니저·메모) + attendees(참석 스탭).
--
-- 권한: 모든 접근은 API(service role)가 프로필 역할을 보고 판정한다(lib/teaching/access.ts).
--   RLS 를 켜고 정책을 두지 않아 anon/authenticated 의 직접 접근은 전부 막힌다 — 코드 쪽 판정이 유일한 관문.

create table if not exists finance.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique,
  role text not null default 'staff' check (role in ('staff', 'manager')),
  stores text[] not null default '{}',
  -- 간편 로그인 계정 여부(구글 로그인 계정은 false — 프로필만 있음)
  simple_login boolean not null default false,
  -- 첫 로그인·초기화 직후: 새 비밀번호를 정할 때까지 true
  pin_reset_required boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table finance.profiles is '계정 프로필 — 표시 이름·지점·역할(staff/manager)·간편 로그인 상태. 대표(OWNER)는 행 없이 admin.';
comment on column finance.profiles.stores is '소속 지점 배열: pangyo | yangjae (둘 다 가능). 매니저는 출근 가능한 지점.';

create table if not exists finance.teaching_wishes (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_key text not null,
  requested_at timestamptz not null default now(),
  unique (user_id, topic_key)
);
comment on table finance.teaching_wishes is '스탭이 배우고 싶은 주제. requested_at 이후 참석한 교육 기록이 있으면 받음 처리, 재요청은 requested_at 갱신.';

create table if not exists finance.teaching_notes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists finance.teaching_shifts (
  id bigserial primary key,
  manager_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  store text not null check (store in ('pangyo', 'yangjae')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (manager_id, date)
);
comment on table finance.teaching_shifts is '매니저 출근 일정 — 하루 한 지점. 전날 20시(KST) 크론이 해당 지점 스탭에게 푸시.';
create index if not exists teaching_shifts_date_idx on finance.teaching_shifts (date);

create table if not exists finance.teaching_sessions (
  id bigserial primary key,
  topic_key text not null,
  date date not null,
  store text not null check (store in ('pangyo', 'yangjae')),
  manager_id uuid not null references auth.users(id) on delete cascade,
  memo text not null default '',
  created_at timestamptz not null default now()
);
comment on table finance.teaching_sessions is '매니저가 남긴 "교육함" 기록. 참석 스탭은 teaching_session_attendees.';

create table if not exists finance.teaching_session_attendees (
  session_id bigint not null references finance.teaching_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (session_id, user_id)
);
create index if not exists teaching_session_attendees_user_idx on finance.teaching_session_attendees (user_id);

-- RLS: 켜고 정책 없음 = service role 외 접근 불가(API 가 유일한 관문)
alter table finance.profiles enable row level security;
alter table finance.teaching_wishes enable row level security;
alter table finance.teaching_notes enable row level security;
alter table finance.teaching_shifts enable row level security;
alter table finance.teaching_sessions enable row level security;
alter table finance.teaching_session_attendees enable row level security;

grant all on table finance.profiles to service_role;
grant all on table finance.teaching_wishes to service_role;
grant all on table finance.teaching_notes to service_role;
grant all on table finance.teaching_shifts to service_role;
grant all on table finance.teaching_sessions to service_role;
grant all on table finance.teaching_session_attendees to service_role;
grant usage, select on sequence finance.teaching_wishes_id_seq to service_role;
grant usage, select on sequence finance.teaching_shifts_id_seq to service_role;
grant usage, select on sequence finance.teaching_sessions_id_seq to service_role;
