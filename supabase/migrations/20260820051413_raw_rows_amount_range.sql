-- 로우데이터 금액 구간 필터 (2026-08-20 대표 요청).
-- 숫자 열(찾으신금액·맡기신금액 등)을 '000,000~000,000원' 구간으로 조회할 수 있게
-- raw_rows_page 에 p_ranges 를 추가한다: {"4": {"min": 1000000, "max": 5000000}}
-- (키=payload 열 인덱스, min/max 는 둘 중 하나만 있어도 됨).
-- 구간 필터가 걸린 열에서 숫자로 못 읽는 행(빈칸·문자)은 제외한다.
-- 시그니처가 바뀌므로 옛 함수는 지운다 — 오버로드로 남기면 PostgREST rpc 가 모호해진다.

drop function if exists finance.raw_rows_page(text, text, date, date, text, jsonb, text, int, boolean, boolean, int, int);

create or replace function finance.raw_rows_page(
  p_source   text,
  p_brand    text default null,
  p_from     date default null,
  p_to       date default null,
  p_q        text default null,
  p_filters  jsonb default null,
  p_ranges   jsonb default null,
  p_sort     text default 'row',
  p_sort_col int default null,
  p_numeric  boolean default false,
  p_desc     boolean default false,
  p_offset   int default 0,
  p_limit    int default 200
)
returns table (id bigint, batch_id bigint, row_index integer, row_date date, payload jsonb)
language sql
stable
security invoker
as $$
  with b as (
    select rb.id
    from finance.raw_batches rb
    where rb.source = p_source
      -- 브랜드 null 배치(쿠팡·네이버페이처럼 여러 브랜드가 섞인 수집분)는 항상 포함
      and (p_brand is null or rb.brand = p_brand or rb.brand is null)
  ),
  f as (
    select r.id, r.batch_id, r.row_index, r.row_date, r.payload,
      case
        when p_sort_col is not null
         and coalesce(r.payload->>p_sort_col, '') ~ '^-?[0-9,]*\.?[0-9]+$'
        then replace(coalesce(r.payload->>p_sort_col, ''), ',', '')::numeric
      end as num_val,
      case when p_sort_col is not null then coalesce(r.payload->>p_sort_col, '') end as txt_val
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
      -- 금액 구간 — min/max 를 벗어나거나 숫자로 못 읽는 행은 제외
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
  select f.id, f.batch_id, f.row_index, f.row_date, f.payload
  from f
  order by
    case when p_sort = 'date' and not p_desc then f.row_date end asc nulls last,
    case when p_sort = 'date' and p_desc     then f.row_date end desc nulls last,
    case when p_sort = 'col' and p_numeric and not p_desc     then f.num_val end asc nulls last,
    case when p_sort = 'col' and p_numeric and p_desc         then f.num_val end desc nulls last,
    case when p_sort = 'col' and not p_numeric and not p_desc then f.txt_val end asc nulls last,
    case when p_sort = 'col' and not p_numeric and p_desc     then f.txt_val end desc nulls last,
    case when p_sort = 'row' and p_desc then f.batch_id end desc,
    case when p_sort = 'row' and p_desc then f.row_index end desc,
    f.batch_id asc, f.row_index asc
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 1000)
$$;

grant execute on function finance.raw_rows_page(text, text, date, date, text, jsonb, jsonb, text, int, boolean, boolean, int, int) to authenticated;
grant execute on function finance.raw_rows_page(text, text, date, date, text, jsonb, jsonb, text, int, boolean, boolean, int, int) to service_role;
