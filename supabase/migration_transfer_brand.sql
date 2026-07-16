-- 송금 요청 브랜드 구분 — 스탭밀/가든서비스 어느 매입인지 태그. (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

alter table finance.transfer_requests
  add column if not exists brand text
  check (brand is null or brand in ('staffmeal', 'garden'));
