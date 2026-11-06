-- 체크리스트 항목 삭제(2026-11-06) — 지난 체크 기록이 참조하므로 행은 남기고 목록에서만 뺀다. 되돌릴 수 있다.
alter table finance.checklist_items
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_name text;

notify pgrst, 'reload schema';
