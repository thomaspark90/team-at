-- 중복 업로드분의 원본 소급 연결 — 2026-08-19.
--
-- raw 레이어 도입 전에 적재된 거래는 raw_row_id 가 비어 있다. 같은 파일을 다시 올려도
-- '전부 중복'이라 새 거래가 생기지 않아 연결될 기회가 없다. 이 함수는 (dedup_hash → raw_row_id)
-- 쌍을 한 번의 UPDATE 로 이어 붙인다 — 행마다 왕복하면 수천 건에서 타임아웃 나기 때문.
--
-- 이미 연결된 행(raw_row_id is not null)은 건드리지 않는다 — 최초 원본이 정본.
create or replace function finance.link_raw_rows(p_hashes text[], p_raw_ids bigint[])
returns integer
language plpgsql
security invoker
as $$
declare
  n integer;
begin
  if p_hashes is null or p_raw_ids is null or array_length(p_hashes, 1) is distinct from array_length(p_raw_ids, 1) then
    raise exception '해시와 원본 행 id 배열 길이가 달라요';
  end if;

  update finance.transactions t
  set raw_row_id = v.raw_id
  from (select unnest(p_hashes) as hash, unnest(p_raw_ids) as raw_id) v
  where t.dedup_hash = v.hash
    and t.raw_row_id is null;

  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function finance.link_raw_rows(text[], bigint[]) to authenticated;
grant execute on function finance.link_raw_rows(text[], bigint[]) to service_role;
