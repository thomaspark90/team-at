-- finance.members RLS 정책 — 원래 Supabase 대시보드에서 직접 만들어져 레포에 기록이 없던 것을
-- 코드로 옮겨 적은 파일(2026-08-07). DB 를 새로 만들거나 복구할 때 이 정책이 빠지면
-- 멤버 테이블(역할·권한)이 무방비가 되므로 반드시 함께 실행한다.
--
-- ⚠️ 조건식의 대표 이메일은 lib/finance/access.ts 의 OWNER_EMAIL 과 동일하게 유지할 것.
--    (그 파일 주석도 "RLS 정책(members read/manage)의 이메일과 반드시 동일하게 유지" 라고 명시)
--
-- 2026-08-07 운영 DB(pg_policies)와 대조 완료 — 조건식 일치 확인함.
-- 정책을 대시보드에서 바꾸면 이 파일도 함께 갱신할 것. 현재 값 확인 방법:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies where schemaname='finance' and tablename='members';

alter table finance.members enable row level security;

-- 조회: 본인 행 또는 관리자·대표
drop policy if exists "members read" on finance.members;
create policy "members read" on finance.members
  for select using (
    id = auth.uid()
    or finance.my_role() = 'admin'::finance.member_role
    or (auth.jwt() ->> 'email') = 'thomas.in.park@gmail.com'
  );

-- 역할·권한 변경: 관리자·대표만. (설정 화면이 anon key 로 직접 update 하므로 이 정책이 유일한 방어선)
drop policy if exists "members manage" on finance.members;
create policy "members manage" on finance.members
  for update using (
    finance.my_role() = 'admin'::finance.member_role
    or (auth.jwt() ->> 'email') = 'thomas.in.park@gmail.com'
  ) with check (
    finance.my_role() = 'admin'::finance.member_role
    or (auth.jwt() ->> 'email') = 'thomas.in.park@gmail.com'
  );

-- 접근 요청: 본인 행만, 역할은 비운 채로만 생성 가능(스스로 admin 부여 차단)
drop policy if exists "self request" on finance.members;
create policy "self request" on finance.members
  for insert with check (id = auth.uid() and role is null);
