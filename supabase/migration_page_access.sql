-- 페이지 접근 권한 확장 — 기존 가든 탭 권한 테이블에 상위 섹션(sections) 권한을 추가. (멱등)
-- tabs    : 가든 하위 탭 허용 목록 (null = 전체 허용)
-- sections: 상위 섹션 허용 목록   (null = 전체 허용) — key 는 lib/access/sections.ts 의 SECTION_KEYS
-- 행이 없으면 둘 다 전체 허용. OWNER 는 항상 전체.
-- 관리는 /garden/settings 의 '페이지 접근 권한' 섹션(admin 전용, API가 service role 로 수행).

alter table finance.garden_tab_access add column if not exists sections text[];

-- 섹션만 제한하고 가든 탭은 전체 허용인 경우를 표현하려면 tabs 가 null 이어야 한다
alter table finance.garden_tab_access alter column tabs drop not null;

-- 본인 행 읽기 정책은 기존과 동일(미들웨어가 자기 권한을 조회함)
drop policy if exists "own garden tab access" on finance.garden_tab_access;
create policy "own garden tab access" on finance.garden_tab_access
  for select using (user_id = auth.uid());
