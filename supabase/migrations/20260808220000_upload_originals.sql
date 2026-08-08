-- 업로드 원본 보관 이력(finance.upload_originals) — 2026-08-08.
-- 모든 파일 업로드 지점(POS·통장·카드·영수증·원두봉투 스캔)이 파싱 전 원본을 Blob에 남기고
-- 이 테이블에 위치를 기록한다. 목적: 파서 개선 시 재업로드 요청 없이 재처리, 과거 원본 열람.
create table if not exists finance.upload_originals (
  id               bigserial primary key,
  area             text not null,             -- 'pos-garden-yangjae' · 'bank-excel-garden' · 'bean-scan' 등
  blob_path        text not null,             -- private Blob pathname (originals/...)
  filename         text not null,             -- 업로드 당시 원본 파일명
  content_type     text,
  size             bigint,
  ym               text,                      -- 자료가 속한 달 'YYYY-MM' (있으면)
  brand            text,                      -- 'garden' | 'staffmeal' (해당 없으면 null)
  store            text,                      -- 'pangyo' | 'yangjae' (해당 없으면 null)
  note             text,                      -- 검색 편의용 부가정보(은행명·카드사·POS종류 등)
  uploaded_by      uuid references auth.users(id),
  uploaded_by_email text,                     -- 조인 없이 표시하기 위한 스냅샷(transfer_requests 와 동일 패턴)
  uploaded_at      timestamptz not null default now()
);
create index if not exists upload_originals_area_idx on finance.upload_originals (area, uploaded_at desc);
create index if not exists upload_originals_uploaded_at_idx on finance.upload_originals (uploaded_at desc);

alter table finance.upload_originals enable row level security;

-- 조회: 재무 담당(admin·classifier) 전체, 그 외는 본인이 올린 것만(원두봉투 스캔은 스탭 누구나 가능)
drop policy if exists "upload_originals select" on finance.upload_originals;
create policy "upload_originals select" on finance.upload_originals for select
  using (finance.my_role() in ('admin', 'classifier') or uploaded_by = auth.uid());

-- 기록: 로그인한 본인 명의로만 남길 수 있다(서버 라우트가 사용자 세션으로 insert)
drop policy if exists "upload_originals insert" on finance.upload_originals;
create policy "upload_originals insert" on finance.upload_originals for insert
  with check (uploaded_by = auth.uid());

-- 삭제: 재무 담당만(다른 지점 자료를 지점 스탭이 지우지 못하게)
drop policy if exists "upload_originals delete" on finance.upload_originals;
create policy "upload_originals delete" on finance.upload_originals for delete
  using (finance.my_role() in ('admin', 'classifier'));

grant all on table finance.upload_originals to authenticated;
grant all on table finance.upload_originals to service_role;
grant all on sequence finance.upload_originals_id_seq to authenticated;
grant all on sequence finance.upload_originals_id_seq to service_role;
