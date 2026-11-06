-- 직원 명부 통합(2026-11-06): schedule_staff 를 명부 정본으로, 필요한 사람만 계정(auth.users)에 연결한다.
-- 재직을 끄면 연결된 계정은 status='left' + 로그인 차단. 지난 기록은 지우지 않는다.

alter table finance.schedule_staff
  add column if not exists user_id uuid unique references auth.users (id) on delete set null;

-- 기존 계정 연결 — 이름이 정확히 같은 프로필만(매장 공용 계정 '양재천'은 명부에 없어 연결되지 않는다)
update finance.schedule_staff s
   set user_id = p.user_id
  from finance.profiles p
 where p.display_name = s.name
   and s.user_id is null;

alter table finance.profiles drop constraint if exists profiles_status_check;
alter table finance.profiles
  add constraint profiles_status_check check (status = any (array['pending'::text, 'active'::text, 'left'::text]));

-- 퇴사 처리 시 이미 열린 세션까지 끊는다(auth 관리 API 에는 사용자 단위 세션 폐기가 없다)
create or replace function finance.revoke_user_sessions(uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = uid;
$$;
revoke all on function finance.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function finance.revoke_user_sessions(uuid) to service_role;

notify pgrst, 'reload schema';
