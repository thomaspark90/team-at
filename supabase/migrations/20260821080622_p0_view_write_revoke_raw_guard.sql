-- P0 보안·보관 강화 (2026-08-21 회계 전면 감사 후속). 두 가지:
--
-- 1) 뷰 쓰기 경로 차단.
--    finance.dashboard_tx 는 transactions 단일 테이블 뷰라 PostgreSQL 이 자동 업데이트 가능
--    뷰로 취급한다. security_invoker 미설정(= 소유자 권한 실행) + anon/authenticated 에
--    INSERT/UPDATE/DELETE/TRUNCATE 까지 GRANT 되어 있어, 원장 RLS('tx write' = admin/classifier
--    한정)를 우회해 뷰 경유로 거래를 지우거나 바꿀 수 있는 경로가 열려 있었다(감사에서 실측).
--    뷰는 전부 읽기 전용이 목적이므로 SELECT 외 권한을 회수한다.
--    ⚠ security_invoker='true' 로 바꾸는 방법은 쓰지 않는다 — dashboard_tx/dashboard_pos 는
--    viewer 역할이 memo 없는 안전한 부분집합을 읽도록 의도된 definer 뷰(뷰 자신이 my_role()
--    게이트를 가짐)라, invoker 전환 시 viewer 의 지표 화면이 0행이 된다.

revoke insert, update, delete, truncate, references, trigger
  on finance.dashboard_tx, finance.dashboard_pos, finance.dashboard_pos_items, finance.monthly_category_totals
  from anon, authenticated;

-- 2) raw 정본층 참조 보호.
--    raw_rows 는 UPDATE 만 차단돼 있고 DELETE 는 열려 있었으며 raw_batches 엔 트리거가 없어,
--    배치 삭제 한 번(fk cascade)으로 원장이 참조하는 원본 행이 통째로 사라질 수 있었다.
--    규칙: **원장(transactions.raw_row_id)이 참조하는 원본 행·배치는 지울 수 없다.**
--    참조가 없는 배치(실패 적재·재업로드 정리)는 기존 운영 규칙대로 배치째 삭제 가능하다.
--    (판정은 transactions_raw_row_idx 인덱스를 타므로 행당 비용이 낮다.)

create or replace function finance.raw_rows_block_referenced_delete() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from finance.transactions t where t.raw_row_id = old.id) then
    raise exception '원장 거래가 참조하는 원본 행(raw_row %)이라 지울 수 없어요 — 해당 거래를 먼저 정리해주세요.', old.id;
  end if;
  return old;
end $$;

drop trigger if exists raw_rows_no_referenced_delete on finance.raw_rows;
create trigger raw_rows_no_referenced_delete before delete on finance.raw_rows
  for each row execute function finance.raw_rows_block_referenced_delete();

create or replace function finance.raw_batches_block_referenced_delete() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1
    from finance.transactions t
    join finance.raw_rows r on r.id = t.raw_row_id
    where r.batch_id = old.id
  ) then
    raise exception '원장 거래가 참조하는 원본 배치(batch %)라 지울 수 없어요 — 해당 거래를 먼저 정리해주세요.', old.id;
  end if;
  return old;
end $$;

drop trigger if exists raw_batches_no_referenced_delete on finance.raw_batches;
create trigger raw_batches_no_referenced_delete before delete on finance.raw_batches
  for each row execute function finance.raw_batches_block_referenced_delete();
