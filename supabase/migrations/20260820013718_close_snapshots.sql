-- 월 결산값(finance.close_snapshots) — 2026-08-20.
--
-- 배경: 모든 집계(전처리1·2·3, 관리손익)는 화면을 열 때마다 즉석 계산이라, 결산을 마친 달의
-- 숫자도 이후 재분류·재업로드로 소리 없이 바뀐다. 스프레드시트 시절의 "검증 끝난 숫자는
-- 시트에 박제된다"는 개념이 없었다.
--
-- 이 테이블은 월 결산(기존 '월 확정') 시점의 집계 결과를 **버전으로 얼려** 보관한다.
--  - 데이터를 잠그지 않는다(유연 모드, 대표 확정): 결산 후에도 분류 수정은 가능하고,
--    현재 계산값이 결산값과 달라지면 화면이 차이를 경고한다. 맞는 변경이면 재결산 → 새 버전.
--  - append-only: 버전은 수정·삭제하지 않는다. "언제 얼마였고 왜 바뀌었나"의 이력이 목적.
create table if not exists finance.close_snapshots (
  id          bigserial primary key,
  ym          text not null,
  brand       text not null,
  store       text not null default '',
  version     integer not null,
  -- 결산 시점의 집계 결과 — 전처리1(소스별)·전처리2(요약 그룹)·전처리3(매출 대사) 요약.
  -- 스키마는 lib/finance/closeSnapshot.ts 의 SnapshotFigures 가 정본(figures.v 로 판독).
  figures     jsonb not null,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  constraint close_snapshots_brand_check check (brand = any (array['staffmeal','garden'])),
  constraint close_snapshots_store_check check (store = any (array['', 'pangyo', 'yangjae'])),
  constraint close_snapshots_unit_ver_key unique (ym, brand, store, version)
);

create index if not exists close_snapshots_unit_idx on finance.close_snapshots (brand, store, ym, version desc);

-- append-only 강제 — 결산 이력은 수정·삭제 불가(재결산 = 새 버전 insert)
create or replace function finance.close_snapshots_block_mutation() returns trigger
  language plpgsql as $$
begin
  raise exception '결산값은 수정·삭제할 수 없어요 — 재결산으로 새 버전을 만들어주세요.';
end $$;

drop trigger if exists close_snapshots_no_update on finance.close_snapshots;
create trigger close_snapshots_no_update before update or delete on finance.close_snapshots
  for each row execute function finance.close_snapshots_block_mutation();

alter table finance.close_snapshots enable row level security;

-- 조회: 재무 구성원 전체(뷰어 포함 — 결산값은 리포트의 기준선). 기록: 결산 권한자(admin)만.
drop policy if exists "close snapshots read" on finance.close_snapshots;
create policy "close snapshots read" on finance.close_snapshots for select
  using (finance.my_role() is not null);

drop policy if exists "close snapshots insert" on finance.close_snapshots;
create policy "close snapshots insert" on finance.close_snapshots for insert
  with check (
    finance.my_role() = 'admin'::finance.member_role
    and (finance.my_brand_scope() is null or finance.my_brand_scope() = brand)
    and created_by = auth.uid()
  );

grant all on table finance.close_snapshots to authenticated;
grant all on table finance.close_snapshots to service_role;
grant all on sequence finance.close_snapshots_id_seq to authenticated;
grant all on sequence finance.close_snapshots_id_seq to service_role;
