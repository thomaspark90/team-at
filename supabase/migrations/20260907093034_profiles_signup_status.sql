-- 간편 계정 자가 가입(승인제) — 2026-09-07 대표 결정.
-- 로그인 화면에서 이름(3글자)·비밀번호를 직접 넣어 가입 신청하면 status='pending' 프로필이 생기고,
-- 대표가 설정에서 역할·지점을 지정해 승인(status='active')해야 로그인이 열린다.
-- 기존 행(대표 발급 계정·구글 프로필)은 전부 active.

alter table finance.profiles
  add column if not exists status text not null default 'active'
  check (status in ('pending', 'active'));

comment on column finance.profiles.status is 'pending=가입 신청(로그인 차단, 대표 승인 대기) / active=사용 가능';
create index if not exists profiles_status_idx on finance.profiles (status);
