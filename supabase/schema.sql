-- Garden Service 재무 ERP — Supabase 스키마 (Phase 1)
-- 설계 스펙: https://claude.ai/code/artifact/6ccab840-3ada-42c3-9cf1-cfaa39ca869a
--
-- team-at 공유 Supabase 프로젝트에 얹되, 기존 앱 테이블과 충돌하지 않도록
-- 전용 스키마 `finance` 에 격리한다. auth.users(구글 로그인)만 공유.
--
-- 적용 순서:
--   1) Supabase SQL Editor 에 이 파일 붙여넣고 실행
--   2) Settings → API → "Exposed schemas" 에 `finance` 추가 (PostgREST 노출)
--   3) Google provider 활성화 (Authentication → Providers → Google)

create schema if not exists finance;
grant usage on schema finance to anon, authenticated;
alter default privileges in schema finance grant all on tables to anon, authenticated;
alter default privileges in schema finance grant all on sequences to anon, authenticated;

-- ---------- enums ----------
create type finance.category_type as enum ('revenue','cogs','sga','non_operating','excluded');
create type finance.close_status  as enum ('open','submitted','confirmed');
create type finance.member_role   as enum ('admin','classifier','viewer');
create type finance.bank_source   as enum ('shinhan','woori');

-- ---------- 사용자·역할 ----------
create table finance.members (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        finance.member_role,             -- null = 승인 대기(pending)
  can_confirm boolean not null default false,   -- 확정 권한(현재 admin만, 나중에 부여 가능)
  created_at  timestamptz not null default now()
);

-- 현재 사용자의 역할 (RLS 헬퍼). OWNER(대표)는 members 행이 없어도 admin.
create or replace function finance.my_role() returns finance.member_role
  language sql stable security definer set search_path = finance, public as $$
  select case
    when (select email from auth.users where id = auth.uid()) = 'thomas.in.park@gmail.com'
      then 'admin'::finance.member_role
    else (select role from finance.members where id = auth.uid())
  end
$$;

-- 월 확정 권한 (RLS 헬퍼). OWNER 는 항상 true, 그 외엔 members.can_confirm.
create or replace function finance.can_confirm() returns boolean
  language sql stable security definer set search_path = finance, public as $$
  select case
    when (select email from auth.users where id = auth.uid()) = 'thomas.in.park@gmail.com'
      then true
    else coalesce((select can_confirm from finance.members where id = auth.uid()), false)
  end
$$;

-- ---------- 계정과목 ----------
create table finance.categories (
  id        bigserial primary key,
  type      finance.category_type not null,
  name      text not null,
  parent_id bigint references finance.categories(id),
  sort      int not null default 0,
  in_pnl    boolean not null default true,  -- 손익 포함 여부(excluded=false)
  active    boolean not null default true,
  pinned    boolean not null default false,  -- 상위노출(분류 드롭다운 '자주 쓰는')
  vat_taxable boolean not null default true, -- 부가세 과세 매입/매출 여부(손익 공급가액 순액 처리 대상)
  unique (type, name)
);

-- ---------- 학습 규칙 ----------
create table finance.rules (
  id             bigserial primary key,
  normalized_key text not null unique,          -- 예: '토스', '현대', '최은숙'
  category_id    bigint not null references finance.categories(id),
  created_by     uuid references auth.users(id),
  hit_count      int not null default 0,
  created_at     timestamptz not null default now()
);

-- ---------- 업로드 원본 ----------
create table finance.uploads (
  id           bigserial primary key,
  bank         finance.bank_source not null,
  period_start date,
  period_end   date,
  blob_url     text,                             -- Vercel Blob 원본 PDF
  row_count    int not null default 0,
  uploaded_by  uuid references auth.users(id),
  uploaded_at  timestamptz not null default now()
);

-- ---------- 거래 ----------
create table finance.transactions (
  id             bigserial primary key,
  bank           finance.bank_source not null,
  tx_at          timestamptz not null,
  ym             text not null,                  -- 'YYYY-MM' 거래일 기준 월귀속
  channel        text,                           -- 적요/거래구분(분류 무시)
  memo           text not null,                  -- 분류 단서
  amount_out     bigint not null default 0,
  amount_in      bigint not null default 0,
  balance        bigint not null default 0,
  branch         text,
  dedup_hash     text not null unique,           -- 재업로드 중복 차단
  normalized_key text not null,
  category_id    bigint references finance.categories(id),  -- null = 미분류
  classified_by  uuid references auth.users(id),
  classified_at  timestamptz,
  upload_id      bigint references finance.uploads(id),
  created_at     timestamptz not null default now()
);
create index on finance.transactions (ym);
create index on finance.transactions (category_id);
create index on finance.transactions (normalized_key);

-- ---------- 월 확정 ----------
create table finance.monthly_close (
  ym           text primary key,                 -- 'YYYY-MM'
  status       finance.close_status not null default 'open',
  submitted_by uuid references auth.users(id),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  updated_at   timestamptz not null default now()
);

-- ---------- RLS ----------
alter table finance.members       enable row level security;
alter table finance.categories    enable row level security;
alter table finance.rules         enable row level security;
alter table finance.uploads       enable row level security;
alter table finance.transactions  enable row level security;
alter table finance.monthly_close enable row level security;

create policy "own membership" on finance.members for select using (id = auth.uid());
create policy "cats read" on finance.categories for select using (finance.my_role() is not null);
create policy "cats insert" on finance.categories for insert with check (finance.my_role() = 'admin');
create policy "cats update" on finance.categories for update
  using (finance.my_role() = 'admin') with check (finance.my_role() = 'admin');
create policy "cats delete" on finance.categories for delete using (finance.my_role() = 'admin');
create policy "tx read"  on finance.transactions for select using (finance.my_role() in ('admin','classifier'));
create policy "tx write" on finance.transactions for all
  using (finance.my_role() in ('admin','classifier')) with check (finance.my_role() in ('admin','classifier'));
create policy "rules rw" on finance.rules for all
  using (finance.my_role() in ('admin','classifier')) with check (finance.my_role() in ('admin','classifier'));
create policy "uploads rw" on finance.uploads for all
  using (finance.my_role() in ('admin','classifier')) with check (finance.my_role() in ('admin','classifier'));
create policy "close read" on finance.monthly_close for select using (finance.my_role() is not null);
create policy "close write" on finance.monthly_close for all
  using (finance.can_confirm()) with check (finance.can_confirm());

-- viewer용 집계 뷰 (raw 노출 없이 확정된 달의 카테고리별 합계만)
create view finance.monthly_category_totals
  with (security_invoker = true) as
  select t.ym, c.type, c.name as category, sum(t.amount_in) as total_in, sum(t.amount_out) as total_out
  from finance.transactions t
  join finance.categories c on c.id = t.category_id
  join finance.monthly_close m on m.ym = t.ym
  where m.status = 'confirmed'
  group by t.ym, c.type, c.name;
