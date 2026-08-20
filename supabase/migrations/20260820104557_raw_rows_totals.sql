-- 로우데이터 소계 (2026-08-20 대표 요청) — 표 맨 아래에 찾으신·맡기신 금액 총합을
-- '지금 걸린 필터·기간의 전체 행' 기준으로 보여주기 위한 집계 함수.
-- 화면은 200행씩 페이징이라 클라이언트 합계로는 전체 소계를 낼 수 없다.
-- ⚠️ 필터 조건(WHERE)은 raw_rows_page 와 반드시 동일하게 유지할 것 — 표와 소계가 어긋나면 안 된다.
-- p_cols: 합산할 payload 열 인덱스 배열(예: {4,5} = 찾으신금액·맡기신금액).
-- 반환: {"count": 전체 행 수, "sums": {"4": 합계, "5": 합계}} — 숫자로 못 읽는 셀은 0 취급.
create or replace function finance.raw_rows_totals(
  p_source  text,
  p_brand   text default null,
  p_from    date default null,
  p_to      date default null,
  p_q       text default null,
  p_filters jsonb default null,
  p_ranges  jsonb default null,
  p_cols    int[] default '{}'
)
returns jsonb
language sql
stable
security invoker
as $$
  with b as (
    select rb.id
    from finance.raw_batches rb
    where rb.source = p_source
      and (p_brand is null or rb.brand = p_brand or rb.brand is null)
  ),
  f as (
    select r.payload
    from finance.raw_rows r
    join b on b.id = r.batch_id
    where (p_from is null or (r.row_date is not null and r.row_date >= p_from))
      and (p_to   is null or (r.row_date is not null and r.row_date <= p_to))
      and (p_q is null or p_q = '' or strpos(lower(r.payload::text), lower(p_q)) > 0)
      and (
        p_filters is null
        or not exists (
          select 1
          from jsonb_each_text(p_filters) ff
          where ff.value <> ''
            and strpos(lower(coalesce(r.payload->>(ff.key::int), '')), lower(ff.value)) = 0
        )
      )
      and (
        p_ranges is null
        or not exists (
          select 1
          from jsonb_each(p_ranges) rr
          where (rr.value->>'min' is not null or rr.value->>'max' is not null)
            and (
              coalesce(r.payload->>(rr.key::int), '') !~ '^-?[0-9,]*\.?[0-9]+$'
              or (rr.value->>'min' is not null
                  and replace(r.payload->>(rr.key::int), ',', '')::numeric < (rr.value->>'min')::numeric)
              or (rr.value->>'max' is not null
                  and replace(r.payload->>(rr.key::int), ',', '')::numeric > (rr.value->>'max')::numeric)
            )
        )
      )
  )
  select jsonb_build_object(
    'count', (select count(*) from f),
    'sums', coalesce(
      (
        select jsonb_object_agg(c.col::text, s.total)
        from unnest(p_cols) as c(col)
        cross join lateral (
          select coalesce(sum(
            case when coalesce(f.payload->>c.col, '') ~ '^-?[0-9,]*\.?[0-9]+$'
                 then replace(f.payload->>c.col, ',', '')::numeric else 0 end
          ), 0) as total
          from f
        ) s
      ),
      '{}'::jsonb
    )
  )
$$;

grant execute on function finance.raw_rows_totals(text, text, date, date, text, jsonb, jsonb, int[]) to authenticated;
grant execute on function finance.raw_rows_totals(text, text, date, date, text, jsonb, jsonb, int[]) to service_role;
