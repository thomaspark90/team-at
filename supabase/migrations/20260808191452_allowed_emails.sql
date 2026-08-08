-- 외부(비 @team-at.space) 계정 로그인 허용 목록 — 설정 > 페이지 접근 권한에서 관리.
-- 미들웨어·로그인 콜백의 isAllowedUser()(lib/finance/access.ts)가 이 테이블을 조회한다.
-- 이메일 사전 등록 시 auth 계정도 함께 생성돼(garden-tab-access POST) 권한을 미리 걸 수 있다.

create table if not exists finance.allowed_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now(),
  created_by text
);

alter table finance.allowed_emails enable row level security;

-- 본인 이메일 행만 조회 — 미들웨어·콜백이 로그인 사용자 세션으로 자기 허용 여부를 확인한다.
-- 쓰기(추가·삭제)는 관리 API 가 service role 로만 수행하므로 별도 정책을 두지 않는다.
drop policy if exists "self read" on finance.allowed_emails;
create policy "self read" on finance.allowed_emails for select
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

grant select on table finance.allowed_emails to anon;
grant select on table finance.allowed_emails to authenticated;
grant all on table finance.allowed_emails to service_role;
