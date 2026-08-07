-- 제철 단어 — 손님 익명 기고 단어 (공개 페이지 /garden-service/words, 검수 /garden/words)
-- Supabase SQL Editor 에 붙여넣고 Run.

create table if not exists public.garden_words (
  id         bigserial primary key,
  text       text not null,
  season     text not null default '여름',
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists garden_words_status_idx on public.garden_words (status, season);

alter table public.garden_words enable row level security;

drop policy if exists "words public read approved" on public.garden_words;
drop policy if exists "words public insert pending" on public.garden_words;
drop policy if exists "words team read" on public.garden_words;
drop policy if exists "words team update" on public.garden_words;
drop policy if exists "words team delete" on public.garden_words;

-- 손님(비로그인): 게시된 단어만 읽기, '대기' 상태로만 제출 (길이 제한은 DB에서도 한 번 더)
create policy "words public read approved" on public.garden_words
  for select using (status = 'approved');
create policy "words public insert pending" on public.garden_words
  for insert with check (status = 'pending' and char_length(btrim(text)) between 1 and 10);

-- 팀(로그인): 전체 읽기 · 상태 변경 · 삭제
create policy "words team read" on public.garden_words
  for select using (auth.uid() is not null);
create policy "words team update" on public.garden_words
  for update using (auth.uid() is not null);
create policy "words team delete" on public.garden_words
  for delete using (auth.uid() is not null);

-- 도배 방지용 익명 식별값 (2026-08-07)
-- submit_sid: 브라우저 익명 세션 ID(httpOnly 쿠키) / submit_iphash: 솔트 섞은 IP SHA-256 해시.
-- 둘 다 역추적 불가 — 같은 제출자 묶기와 속도 제한에만 쓴다. 고지 문구는 공개 페이지 하단.
alter table public.garden_words add column if not exists submit_sid text;
alter table public.garden_words add column if not exists submit_iphash text;
create index if not exists garden_words_sid_idx on public.garden_words (submit_sid);
