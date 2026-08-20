-- 전처리4 상품별 상세의 노출·순서 설정 — 2026-08-20.
--
-- 메뉴가 많아(스탭밀 상세 30여 열) 안 보는 상품을 숨기고 자주 보는 상품을 앞으로 두고
-- 싶다는 요구. 단위(brand+store)별 한 행 — 사용자별이 아니라 매장별 설정(팀이 같은 표를 본다).
--   hidden: 숨길 상품 라벨 배열
--   sort:   명시 순서 배열 — 여기 있는 상품이 그 순서대로 앞에, 나머지는 총액순으로 뒤에
create table if not exists finance.prep_menu_prefs (
  brand      text not null,
  store      text not null default '',
  hidden     jsonb not null default '[]'::jsonb,
  sort       jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (brand, store),
  constraint prep_menu_prefs_brand_check check (brand = any (array['staffmeal','garden'])),
  constraint prep_menu_prefs_store_check check (store = any (array['', 'pangyo', 'yangjae']))
);

alter table finance.prep_menu_prefs enable row level security;

drop policy if exists "prep menu prefs rw" on finance.prep_menu_prefs;
create policy "prep menu prefs rw" on finance.prep_menu_prefs
  using (
    finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
    and (finance.my_brand_scope() is null or finance.my_brand_scope() = brand)
  )
  with check (
    finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
    and (finance.my_brand_scope() is null or finance.my_brand_scope() = brand)
  );

grant all on table finance.prep_menu_prefs to authenticated;
grant all on table finance.prep_menu_prefs to service_role;
