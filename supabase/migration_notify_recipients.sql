-- 알림 수신자 목록 — 새 송금 요청 알림(이메일·푸시)을 받을 사람. admin(대표)만 관리 (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

create table if not exists finance.notify_recipients (
  id         bigserial primary key,
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table finance.notify_recipients enable row level security;

drop policy if exists "notify recipients read"   on finance.notify_recipients;
drop policy if exists "notify recipients insert" on finance.notify_recipients;
drop policy if exists "notify recipients delete" on finance.notify_recipients;
-- read 는 로그인자 전체: 발송이 요청 등록자 세션에서 일어나 수신자 목록을 읽어야 함
create policy "notify recipients read" on finance.notify_recipients for select using (auth.uid() is not null);
create policy "notify recipients insert" on finance.notify_recipients for insert
  with check (finance.my_role() = 'admin');
create policy "notify recipients delete" on finance.notify_recipients for delete
  using (finance.my_role() = 'admin');

-- 초기 수신자 = 대표 (기존 동작 유지)
insert into finance.notify_recipients (email)
values ('thomas.in.park@gmail.com')
on conflict (email) do nothing;
