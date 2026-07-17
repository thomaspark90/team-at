-- 회계자료 엑셀 업로드 — bank_source 에 'excel' 추가. (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

alter type finance.bank_source add value if not exists 'excel';
