-- 스탭밀 하위 탭 접근 권한 확장 — garden_tab_access 테이블에 studio_tabs 컬럼 추가.
-- null = 전체 허용(기존과 동일). 탭 키: dashboard, menu, meals, sales, settings
-- (lib/studio/tabs.ts 의 STUDIO_TAB_KEYS 와 동일하게 유지할 것)
alter table finance.garden_tab_access add column if not exists studio_tabs text[];
