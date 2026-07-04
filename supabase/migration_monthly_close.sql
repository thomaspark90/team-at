-- 월 확정(monthly_close) — OWNER 접근 보정 마이그레이션
-- Supabase SQL Editor 에 붙여넣고 실행. 멱등(여러 번 실행해도 안전).
--
-- 배경: OWNER(대표)는 finance.members 행이 없어 자동 admin 으로만 취급된다.
--   기존 close read/write 정책은 members 를 직접 조회해 OWNER 를 막았다.
--   → my_role() 에 OWNER 특례를 넣고, can_confirm() 헬퍼를 추가해 정책을 재작성.

-- 1) my_role(): OWNER 이메일은 members 행이 없어도 admin
create or replace function finance.my_role() returns finance.member_role
  language sql stable security definer set search_path = finance, public as $$
  select case
    when (select email from auth.users where id = auth.uid()) = 'thomas.in.park@gmail.com'
      then 'admin'::finance.member_role
    else (select role from finance.members where id = auth.uid())
  end
$$;

-- 2) can_confirm(): OWNER 는 항상 확정 가능, 그 외엔 members.can_confirm
create or replace function finance.can_confirm() returns boolean
  language sql stable security definer set search_path = finance, public as $$
  select case
    when (select email from auth.users where id = auth.uid()) = 'thomas.in.park@gmail.com'
      then true
    else coalesce((select can_confirm from finance.members where id = auth.uid()), false)
  end
$$;

-- 3) monthly_close 정책 재작성 (read = 재무 멤버 누구나, write = 확정 권한자)
drop policy if exists "close read"  on finance.monthly_close;
drop policy if exists "close write" on finance.monthly_close;

create policy "close read" on finance.monthly_close
  for select using (finance.my_role() is not null);

create policy "close write" on finance.monthly_close
  for all using (finance.can_confirm()) with check (finance.can_confirm());
