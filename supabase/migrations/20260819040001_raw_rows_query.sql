-- 로우데이터 정렬·필터·기간 조회 — 2026-08-19.
--
-- 클라이언트에서 정렬·필터를 하면 '지금 불러온 200행' 안에서만 동작해 틀린 결과를 보여준다
-- (스크롤을 더 내리면 순서가 바뀌는 표). 그래서 전 범위를 서버에서 정렬·필터한 뒤 페이징한다.

-- 1) 행 날짜 — 기간 조회·시간순 정렬의 기준. 파서가 원본 행에서 읽어낸 날짜를 적재 시 함께 넣는다.
--    (payload 는 원본 그대로 두고, 조회용 파생값만 별도 컬럼으로 뽑는다)
alter table finance.raw_rows add column if not exists row_date date;
create index if not exists raw_rows_date_idx on finance.raw_rows (batch_id, row_date);

-- 2) append-only 트리거 완화 — 원본(payload·소속·행번호)은 여전히 불변, 파생 메타(row_date)는 갱신 허용.
--    스키마가 늘어날 때마다 트리거를 끄고 켜야 하는 걸 막는다.
create or replace function finance.raw_rows_block_update() returns trigger
  language plpgsql as $$
begin
  if new.payload is distinct from old.payload
     or new.batch_id is distinct from old.batch_id
     or new.row_index is distinct from old.row_index then
    raise exception 'finance.raw_rows 의 원본(payload·batch_id·row_index)은 수정할 수 없어요. 배치를 지우고 다시 올려주세요.';
  end if;
  return new;
end $$;

-- 3) 기존 적재분 백필 — 앞쪽 열에서 날짜 형태(YYYY.MM.DD / YYYY-MM-DD / YYYY/MM/DD)를 찾아 채운다.
--    raw 도입 전 파일에는 매핑 정보가 남아 있지 않아 열을 훑는 방식으로 처리(일회성).
with cand as (
  select r.id,
    substring(
      (select x
       from unnest(array[r.payload->>0, r.payload->>1, r.payload->>2, r.payload->>3, r.payload->>4]) as x
       where x ~ '\d{4}[./-]\d{2}[./-]\d{2}'
       limit 1)
      from '\d{4}[./-]\d{2}[./-]\d{2}'
    ) as cell
  from finance.raw_rows r
  where r.row_date is null
    and jsonb_typeof(r.payload) = 'array'
)
update finance.raw_rows r
set row_date = to_date(replace(replace(cand.cell, '.', '-'), '/', '-'), 'YYYY-MM-DD')
from cand
where cand.id = r.id and cand.cell is not null;

-- 4) 조회 함수 — 출처·브랜드·기간·검색어·컬럼필터로 걸러 정렬·페이징한다.
--    p_filters: {"3": "카드"} 형태(키=payload 배열 인덱스, 값=포함 문자열).
--    p_sort: 'row'(원본 순) | 'date'(행 날짜) | 'col'(특정 열), p_numeric=true 면 숫자로 비교.
create or replace function finance.raw_rows_page(
  p_source   text,
  p_brand    text default null,
  p_from     date default null,
  p_to       date default null,
  p_q        text default null,
  p_filters  jsonb default null,
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

grant execute on function finance.raw_rows_page(text, text, date, date, text, jsonb, text, int, boolean, boolean, int, int) to authenticated;
grant execute on function finance.raw_rows_page(text, text, date, date, text, jsonb, text, int, boolean, boolean, int, int) to service_role;
