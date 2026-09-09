-- 역할 목록을 대표가 관리(2026-09-09 대표 지시) — 스탭/매니저 고정 체크 제약을 테이블로 옮긴다.
-- 각 역할은 can_manage(교육 운영 권한: 출근 일정·집계·교육함 기록) 한 가지 스위치만 가진다.
--   · can_manage=false → 스탭 화면(위시리스트), 교육 참석자 후보
--   · can_manage=true  → 매니저 화면, 출근 일정 등록 가능
-- builtin(스탭·매니저)은 삭제 불가. 사용 중인 역할도 삭제 불가(코드에서 확인).

create table if not exists finance.profile_roles (
  key text primary key,
  label text not null unique,
  can_manage boolean not null default false,
  builtin boolean not null default false,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
comment on table finance.profile_roles is '간편 계정 역할 목록. can_manage=교육 운영 권한(매니저급). 설정 › 간편 계정 › 역할에서 관리.';

insert into finance.profile_roles (key, label, can_manage, builtin, sort) values
  ('staff', '스탭', false, true, 10),
  ('manager', '매니저', true, true, 20)
on conflict (key) do nothing;

alter table finance.profiles drop constraint if exists profiles_role_check;
alter table finance.profiles drop constraint if exists profiles_role_fkey;
alter table finance.profiles
  add constraint profiles_role_fkey foreign key (role) references finance.profile_roles(key);

alter table finance.profile_roles enable row level security;
grant all on table finance.profile_roles to service_role;
