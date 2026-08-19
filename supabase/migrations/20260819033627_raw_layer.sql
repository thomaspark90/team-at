-- 로우데이터 레이어(finance.raw_batches · finance.raw_rows) — 2026-08-19.
--
-- 배경: 지금까지 파일/수집 데이터는 파서를 거쳐 바로 finance.transactions · finance.pos_sales 로
-- 들어갔고, 파싱 전 원본 "행"은 어디에도 남지 않았다. 그래서 파서가 잘못 읽어도(미트박스 부분취소를
-- 전액환불로 오판한 2026-08-17 사고) 사후에 대조할 기준이 없었다.
--
-- 이 레이어는 파서가 파일에서 읽어낸 행을 **변환 전 그대로** 1:1 로 보관한다. 부호 변환·분류·
-- 중복제거·정산연결 등 어떤 비즈니스 로직도 거치기 전 상태다. transactions 는 이 raw 에서 파생된
-- 작업용 사본이 되고, raw_row_id 로 원본을 역참조한다.
--
-- 원칙: append-only. 한 번 쌓은 행은 UPDATE 할 수 없다(트리거로 차단). 잘못 올린 배치는
-- 배치째 삭제(cascade)하고 다시 올린다 — 행 단위 수정으로 원본이 흐려지는 걸 막는다.

-- 배치 = 업로드 파일 1건 또는 수집 1회분
create table if not exists finance.raw_batches (
  id            bigserial primary key,
  source        text not null,             -- 'bank' | 'card' | 'pos' | 'coupang' | 'naverpay'
  issuer        text,                      -- 'woori' · 'shinhan' · '신한' · 'BC' · 'payhere' · 'toss' 등 세부 출처
  brand         text not null,
  store         text,                      -- 'pangyo' | 'yangjae' (스탭밀 등 지점 없으면 null)
  filename      text,                      -- 업로드 파일명(수집형은 null)
  header        jsonb,                     -- 원본 헤더 행 — 컬럼 순서·이름 그대로 보관
  row_count     integer not null default 0,
  upload_id     bigint,                    -- 대응하는 finance.uploads 배치(있으면)
  original_id   bigint,                    -- 대응하는 finance.upload_originals(Blob 원본 파일)
  period_start  date,
  period_end    date,
  ingested_at   timestamptz not null default now(),
  ingested_by   uuid,
  constraint raw_batches_source_check check (source = any (array['bank','card','pos','coupang','naverpay'])),
  constraint raw_batches_brand_check check (brand = any (array['staffmeal','garden','personal'])),
  constraint raw_batches_store_check check (store is null or store = any (array['pangyo','yangjae'])),
  constraint raw_batches_upload_fkey foreign key (upload_id) references finance.uploads(id) on delete set null,
  constraint raw_batches_original_fkey foreign key (original_id) references finance.upload_originals(id) on delete set null,
  constraint raw_batches_ingested_by_fkey foreign key (ingested_by) references auth.users(id)
);

create index if not exists raw_batches_scope_idx on finance.raw_batches (brand, source, ingested_at desc);
create index if not exists raw_batches_period_idx on finance.raw_batches (period_start, period_end);

-- 원본 행 — payload 는 파서가 읽은 컬럼 배열/객체를 가공 없이 담는다
create table if not exists finance.raw_rows (
  id         bigserial primary key,
  batch_id   bigint not null,
  row_index  integer not null,             -- 원본 파일에서의 행 번호(헤더 포함 절대 위치, 0-base)
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  constraint raw_rows_batch_fkey foreign key (batch_id) references finance.raw_batches(id) on delete cascade,
  constraint raw_rows_batch_row_key unique (batch_id, row_index)
);

create index if not exists raw_rows_batch_idx on finance.raw_rows (batch_id, row_index);

-- append-only 강제 — 원본 행은 수정 불가(잘못된 배치는 배치째 지우고 재적재)
create or replace function finance.raw_rows_block_update() returns trigger
  language plpgsql as $$
begin
  raise exception 'finance.raw_rows 는 append-only 예요 — 행을 수정할 수 없어요. 배치를 지우고 다시 올려주세요.';
end $$;

drop trigger if exists raw_rows_no_update on finance.raw_rows;
create trigger raw_rows_no_update before update on finance.raw_rows
  for each row execute function finance.raw_rows_block_update();

-- 가공 행 → 원본 행 역참조. 기존 데이터는 null(raw 도입 전이라 원본이 없음).
alter table finance.transactions add column if not exists raw_row_id bigint;
do $$ begin
  alter table finance.transactions
    add constraint transactions_raw_row_fkey foreign key (raw_row_id)
    references finance.raw_rows(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists transactions_raw_row_idx on finance.transactions (raw_row_id);

-- POS 는 파서가 (일×카테고리)로 집계해 저장하므로 행 단위가 아니라 배치 단위로 잇는다
alter table finance.pos_sales add column if not exists raw_batch_id bigint;
do $$ begin
  alter table finance.pos_sales
    add constraint pos_sales_raw_batch_fkey foreign key (raw_batch_id)
    references finance.raw_batches(id) on delete set null;
exception when duplicate_object then null; end $$;

alter table finance.raw_batches enable row level security;
alter table finance.raw_rows enable row level security;

-- 조회·기록: 재무 담당(admin·classifier)이 자기 브랜드 범위 안에서
drop policy if exists "raw batches rw" on finance.raw_batches;
create policy "raw batches rw" on finance.raw_batches
  using (
    finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
    and (finance.my_brand_scope() is null or finance.my_brand_scope() = brand)
  )
  with check (
    finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
    and (finance.my_brand_scope() is null or finance.my_brand_scope() = brand)
  );

drop policy if exists "raw rows rw" on finance.raw_rows;
create policy "raw rows rw" on finance.raw_rows
  using (
    exists (
      select 1 from finance.raw_batches b
      where b.id = raw_rows.batch_id
        and finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
        and (finance.my_brand_scope() is null or finance.my_brand_scope() = b.brand)
    )
  )
  with check (
    exists (
      select 1 from finance.raw_batches b
      where b.id = raw_rows.batch_id
        and finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
        and (finance.my_brand_scope() is null or finance.my_brand_scope() = b.brand)
    )
  );

grant all on table finance.raw_batches to authenticated;
grant all on table finance.raw_batches to service_role;
grant all on table finance.raw_rows to authenticated;
grant all on table finance.raw_rows to service_role;
grant all on sequence finance.raw_batches_id_seq to authenticated;
grant all on sequence finance.raw_batches_id_seq to service_role;
grant all on sequence finance.raw_rows_id_seq to authenticated;
grant all on sequence finance.raw_rows_id_seq to service_role;
