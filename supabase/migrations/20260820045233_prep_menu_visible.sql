-- 전처리4 노출 목록을 화이트리스트로 전환 — 2026-08-20.
--
-- 기존 hidden(블랙리스트) 방식은 새 상품이 자동 노출된다. 2023~24년 POS 재업로드로 옛 메뉴
-- 수십 개가 한꺼번에 표에 쏟아지면서(체크한 적 없는 항목들), '체크한 것만 보인다'가 맞는
-- 의미론임이 확인됐다(대표 지시). visible 이 null 이 아니면 그 목록만 노출하고 hidden 은
-- 레거시로 무시한다.
alter table finance.prep_menu_prefs add column if not exists visible jsonb;
