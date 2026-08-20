-- 전처리4 상품 병합 매핑 — 2026-08-20.
-- POS에서 상품명을 중간에 고치면서 같은 메뉴가 여러 표기로 분화됐다('staff포장'·'Staff (기본 / 포장)'
-- ·'STAFF (Medium)'…). 병합은 표시 차원의 매핑만 저장한다 — pos_items 원본은 불변(로우데이터 원칙),
-- 표에서 소스 열들이 대표 열로 합산될 뿐이며 매핑을 지우면 원래대로 돌아온다.
-- 형식: { "대표 라벨": ["합쳐질 라벨", ...] }
alter table finance.prep_menu_prefs add column if not exists merges jsonb not null default '{}'::jsonb;
