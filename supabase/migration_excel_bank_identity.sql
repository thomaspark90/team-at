-- 엑셀 은행 슬롯 업로드에 실제 은행 기록 백필 (2026-08-02, 멱등)
-- 문제: 엑셀로 올린 은행 거래가 bank='excel'로 저장돼, 월별 보드의 '내역 →' 링크
-- (/finance/classify?bank=woori)와 분류 화면 은행 필터에 안 잡힘.
-- 코드도 함께 수정됨(새 저장은 슬롯의 실제 은행 기록) — 이건 기존 행 보정.
-- Supabase SQL Editor 에 붙여넣고 Run.

update finance.transactions t
set bank = replace(u.slot, 'bank_', '')::finance.bank_source
from finance.uploads u
where t.upload_id = u.id
  and u.slot in ('bank_shinhan', 'bank_woori')
  and t.bank = 'excel';

update finance.uploads
set bank = replace(slot, 'bank_', '')::finance.bank_source
where slot in ('bank_shinhan', 'bank_woori')
  and bank = 'excel';
