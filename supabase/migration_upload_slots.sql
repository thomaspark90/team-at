-- 월별 회계자료 업로드 보드 — 업로드가 어느 월·슬롯(신한/우리/쿠팡/네이버/주지출카드) 몫인지 기록. (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

alter table finance.uploads add column if not exists slot text;
alter table finance.uploads add column if not exists slot_ym text;
create index if not exists uploads_slot_ym_idx on finance.uploads (slot_ym, slot);
