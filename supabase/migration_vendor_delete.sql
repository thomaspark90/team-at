-- 거래처 계좌장부 삭제 정책 — 관리 화면(admin/classifier)에서 잘못 학습된 거래처 제거용 (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

drop policy if exists "vendor accounts delete" on finance.vendor_accounts;
create policy "vendor accounts delete" on finance.vendor_accounts for delete
  using (finance.my_role() in ('admin','classifier'));
