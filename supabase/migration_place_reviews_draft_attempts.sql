-- 초안 생성 재시도 횟수 — 영구 실패하는 오래된 리뷰가 재시도 예산을 독점해
-- 새 리뷰 초안 생성을 막는 것(head-of-line blocking)을 방지. 5회 초과는 재시도 제외. (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

alter table finance.place_reviews
  add column if not exists draft_attempts int not null default 0;
