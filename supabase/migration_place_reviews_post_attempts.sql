-- 답글 게시 재시도 횟수 — 실패가 REVIEW_POST_MAX_ATTEMPTS(5)에 달하면 게시기가 더
-- 가져가지 않는다(무한 재시도 방지). 재승인하면 0으로 리셋. (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

alter table finance.place_reviews
  add column if not exists post_attempts int not null default 0;
