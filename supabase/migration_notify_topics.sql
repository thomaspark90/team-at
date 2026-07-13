-- 알림 수신자 종류별 수신 여부 — 송금 요청 / 원두 재고를 사람별로 켜고 끈다. (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

alter table finance.notify_recipients
  add column if not exists transfer_enabled boolean not null default true,
  add column if not exists stock_enabled    boolean not null default true;

-- 토글 저장(upsert)용 update 정책 — admin만
drop policy if exists "notify recipients update" on finance.notify_recipients;
create policy "notify recipients update" on finance.notify_recipients for update
  using (finance.my_role() = 'admin')
  with check (finance.my_role() = 'admin');
