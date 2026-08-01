-- 브랜드별 설정 — 사용 은행 (스탭밀=우리은행만, 2026-08-01 대표 확인).
-- 설정 화면(/finance/categories '설정')에서 관리하고, 업로드 보드·월확정 게이트·월 배지가
-- 이 목록의 은행 슬롯만 요구한다. 은행 '추가' 기능이 아니라 파서가 있는 은행(신한·우리) 중
-- 어떤 걸 쓰는지 고르는 것. 행이 없는 브랜드는 전체 은행 사용으로 간주(코드 폴백).
-- 멱등: Supabase SQL Editor 에 붙여넣고 Run.

create table if not exists finance.brand_settings (
  brand      text primary key check (brand in ('staffmeal','garden','personal')),
  banks      text[] not null default array['shinhan','woori'],
  updated_at timestamptz not null default now()
);

alter table finance.brand_settings enable row level security;

drop policy if exists "brand_settings read" on finance.brand_settings;
create policy "brand_settings read" on finance.brand_settings for select
  using (finance.my_role() is not null);

drop policy if exists "brand_settings write" on finance.brand_settings;
create policy "brand_settings write" on finance.brand_settings for all
  using (finance.my_role() = 'admin')
  with check (finance.my_role() = 'admin');

-- 초기값 — 스탭밀은 우리은행만 사용
insert into finance.brand_settings (brand, banks) values
  ('staffmeal', array['woori']),
  ('garden', array['shinhan','woori'])
on conflict (brand) do nothing;
