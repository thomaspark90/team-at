-- 로우데이터 계좌(발급기관) 필터 (2026-08-23 대표 요청 — 가든 양재 통장 2개를 개별로 보기).
-- raw_rows_page / raw_rows_totals 에 p_issuer 를 추가한다: 'shinhan' | 'woori' 등
-- raw_batches.issuer 로 배치를 거른다(null = 전체, 기존 동작).
-- 시그니처가 바뀌므로 옛 함수는 지운다 — 오버로드로 남기면 PostgREST rpc 가 모호해진다
-- (20260820051413 과 동일 규칙). ⚠️ 두 함수의 WHERE 는 반드시 동일하게 유지할 것.

drop function if exists finance.raw_rows_page(text, text, date, date, text, jsonb, jsonb, text, int, boolean, boolean, int, int);
drop function if exists finance.raw_rows_totals(text, text, date, date, text, jsonb, jsonb, int[]);

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
  p_limit    int default 200,
  p_issuer   text default null
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
      and (p_issuer is null or rb.issuer = p_issuer)
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

create or replace function finance.raw_rows_totals(
  p_source  text,
  p_brand   text default null,
  p_from    date default null,
  p_to      date default null,
  p_q       text default null,
  p_filters jsonb default null,
  p_ranges  jsonb default null,
  p_cols    int[] default '{}',
  p_issuer  text default null
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
      and (p_issuer is null or rb.issuer = p_issuer)
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

grant execute on function finance.raw_rows_page(text, text, date, date, text, jsonb, jsonb, text, int, boolean, boolean, int, int, text) to authenticated;
grant execute on function finance.raw_rows_page(text, text, date, date, text, jsonb, jsonb, text, int, boolean, boolean, int, int, text) to service_role;
grant execute on function finance.raw_rows_totals(text, text, date, date, text, jsonb, jsonb, int[], text) to authenticated;
grant execute on function finance.raw_rows_totals(text, text, date, date, text, jsonb, jsonb, int[], text) to service_role;
