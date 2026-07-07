-- 알림 채널 설정 — 수신자가 이메일 알림을 켜고 끌 수 있게 (웹푸시는 기기별 구독으로 관리) (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

create table if not exists finance.notify_prefs (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  email_enabled boolean not null default true,
  updated_at    timestamptz not null default now()
);

alter table finance.notify_prefs enable row level security;

drop policy if exists "notify prefs read"   on finance.notify_prefs;
drop policy if exists "notify prefs insert" on finance.notify_prefs;
drop policy if exists "notify prefs update" on finance.notify_prefs;
-- read 는 로그인자 전체: 발송이 요청 등록자 세션에서 일어나 수신자 설정을 읽어야 함
create policy "notify prefs read" on finance.notify_prefs for select using (auth.uid() is not null);
create policy "notify prefs insert" on finance.notify_prefs for insert with check (auth.uid() = user_id);
create policy "notify prefs update" on finance.notify_prefs for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
