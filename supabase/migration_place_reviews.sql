-- 네이버 스마트플레이스 리뷰 관리 — 스키마 (멱등)
-- Supabase SQL Editor 에 붙여넣고 실행. 여러 번 실행해도 안전.
--
-- 파이프라인: 로컬 수집기(naver-review-manager, launchd)
--   → POST /api/garden-reviews/ingest (x-review-token, service role)
--     신규 리뷰 적재 + Gemini 답글 초안 생성(status='drafted')
--   → /garden/reviews 에서 매니저가 초안 확인·수정·승인(status='approved')
--   → 게시기(post.mjs)가 승인분을 스마트플레이스에 등록(status='posted')
--
-- 답글은 승인 전에는 절대 게시되지 않는다(초안 생성 + 승인 후 게시).

create table if not exists finance.place_reviews (
  id            bigserial primary key,
  review_id     text not null unique,          -- 네이버 리뷰 고유 id (dedup 키)
  store_key     text not null,                 -- 'yangjae' | 'pangyo'
  place_id      text not null,                 -- 스마트플레이스 placeId
  author        text,
  rating        numeric(2,1),
  content       text,                          -- 리뷰 본문 (사진만 있는 리뷰는 null)
  keywords      text[],                        -- 선택 키워드 라벨 ("커피가 맛있어요" 등)
  visit_count   int,
  photo_count   int default 0,
  reviewed_at   timestamptz not null,          -- 리뷰 작성 시각
  had_reply     boolean not null default false,-- 수집 시점에 이미 답글이 있었는지

  draft         text,                          -- AI 답글 초안 (기본 선택안)
  draft_variants jsonb,                        -- 톤 3종 추천안 [{tone,label,text}]
  draft_model   text,
  draft_at      timestamptz,
  reply_text    text,                          -- 매니저가 확정한 답글 본문
  approved_tone text,                          -- 확정한 톤 (kind/plain/grateful)
  approved_by   text,
  approved_at   timestamptz,
  posted_at     timestamptz,
  post_error    text,                          -- 게시 실패 사유(재시도 진단용)

  -- new: 수집만 됨 / drafted: 초안 있음 / approved: 승인(게시 대기)
  -- posted: 게시 완료 / skipped: 답글 안 달기로 함 / replied_elsewhere: 외부에서 이미 답글
  status        text not null default 'new',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists place_reviews_status_idx on finance.place_reviews (status, reviewed_at desc);
create index if not exists place_reviews_store_idx  on finance.place_reviews (store_key, reviewed_at desc);

-- service_role 권한 (무인 수집기/게시기용 — migration_naverpay.sql 과 동일 패턴)
grant usage on schema finance to service_role;
grant all on all tables in schema finance to service_role;
grant all on all sequences in schema finance to service_role;

-- updated_at 자동 갱신
create or replace function finance.touch_place_reviews() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists place_reviews_touch on finance.place_reviews;
create trigger place_reviews_touch before update on finance.place_reviews
  for each row execute function finance.touch_place_reviews();

-- RLS — anon 키 직접 접근 차단. 수집기/게시기는 service_role이라 우회,
-- 매니저 페이지는 로그인 세션(authenticated)이라 아래 정책으로 동작.
alter table finance.place_reviews enable row level security;

drop policy if exists "reviews team read"   on finance.place_reviews;
drop policy if exists "reviews team update" on finance.place_reviews;

create policy "reviews team read" on finance.place_reviews
  for select using (auth.uid() is not null);
create policy "reviews team update" on finance.place_reviews
  for update using (auth.uid() is not null);
-- insert/delete 정책은 의도적으로 없음 → 적재·삭제는 service_role(수집기)만 가능

-- 기존 테이블에 톤 3종 추천안 컬럼 추가 (2026-08-07)
alter table finance.place_reviews add column if not exists draft_variants jsonb;
alter table finance.place_reviews add column if not exists approved_tone text;

-- status 값 오타 방지
alter table finance.place_reviews drop constraint if exists place_reviews_status_chk;
alter table finance.place_reviews add constraint place_reviews_status_chk
  check (status in ('new','drafted','approved','posted','skipped','replied_elsewhere'));

-- 이슈·개선 리뷰 분류 (2026-08-07)
-- issue: null=미분류 / true=불만·개선 지적 포함 / false=해당 없음
-- issue_note: 지적 내용 한 줄 요약 ("매장 소음 울림 · 조리 위생" 등)
alter table finance.place_reviews add column if not exists issue boolean;
alter table finance.place_reviews add column if not exists issue_note text;
create index if not exists place_reviews_issue_idx
  on finance.place_reviews (issue, reviewed_at desc) where issue is true;
