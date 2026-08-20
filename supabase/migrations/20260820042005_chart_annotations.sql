-- 통장 입출금·잔액 차트의 대여금 마커 라벨 오버라이드 (2026-08-20 대표 요청).
-- 마커 자체는 '대여금'(excluded) 분류 거래에서 자동 생성되고(분류가 정본),
-- 이 테이블은 (brand, ym)별 표기 문구만 덮어쓴다 — 기본 라벨은 '가든서비스 대여금'.
create table if not exists finance.chart_annotations (
  brand text not null,
  ym text not null,
  label text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (brand, ym)
);

alter table finance.chart_annotations enable row level security;

drop policy if exists "chart_annotations select" on finance.chart_annotations;
create policy "chart_annotations select" on finance.chart_annotations
  for select using (
    finance.my_role() is not null
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope())
  );

drop policy if exists "chart_annotations write" on finance.chart_annotations;
create policy "chart_annotations write" on finance.chart_annotations
  for all using (
    finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope())
  ) with check (
    finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope())
  );

grant all on table finance.chart_annotations to anon;
grant all on table finance.chart_annotations to authenticated;
grant all on table finance.chart_annotations to service_role;
