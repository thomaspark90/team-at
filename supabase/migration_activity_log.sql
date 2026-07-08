-- 활동 로그 — 누가 어떤 기능을 썼는지 기록. 열람은 admin 전용 (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

create table if not exists finance.activity_logs (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  user_id    uuid,
  email      text not null,
  action     text not null,  -- 기능 이름 (예: '송금 요청 등록')
  detail     text            -- 부가 정보 (예: '순이유통 ₩283,000')
);
create index if not exists activity_logs_created_idx on finance.activity_logs (created_at desc);

alter table finance.activity_logs enable row level security;

drop policy if exists "activity insert" on finance.activity_logs;
drop policy if exists "activity read"   on finance.activity_logs;
-- 기록은 로그인한 사용자 요청 처리 중 서버가 남김, 열람은 admin 만
create policy "activity insert" on finance.activity_logs for insert with check (auth.uid() is not null);
create policy "activity read" on finance.activity_logs for select using (finance.my_role() = 'admin');
