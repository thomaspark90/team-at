-- 웹 푸시 구독 — 송금 요청 알림 수신 기기 저장 (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

create table if not exists finance.push_subscriptions (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_email_idx on finance.push_subscriptions (email);

alter table finance.push_subscriptions enable row level security;

drop policy if exists "push read"   on finance.push_subscriptions;
drop policy if exists "push insert" on finance.push_subscriptions;
drop policy if exists "push delete" on finance.push_subscriptions;
-- 발송은 로그인 사용자의 요청 등록 시 서버가 수신자 구독을 읽어 처리 → 로그인자 전체 read.
-- delete 도 로그인자 전체: 서버가 만료 구독(410 Gone)을 발송 시점에 정리해야 해서.
create policy "push read" on finance.push_subscriptions for select using (auth.uid() is not null);
create policy "push insert" on finance.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push delete" on finance.push_subscriptions for delete using (auth.uid() is not null);
