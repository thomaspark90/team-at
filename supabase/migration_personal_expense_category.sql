-- 개인지출 계정 추가 — 네이버(사업 계정)에서 개인 카드로 결제한 사적 지출 분류용. (멱등)
-- 손익 제외(excluded) 유형: 관리손익·대시보드·지표 어디에도(스탭밀/가든 어느 사업장에도) 지출로 잡히지 않는다.
-- 자금흐름 뷰의 '손익 제외' 그룹에만 참고 표시(통장 대사 목적).
-- pinned=true: 분류 드롭다운 '자주 쓰는' 상단 노출.
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.

insert into finance.categories (type, name, in_pnl, vat_taxable, pinned, sort)
values ('excluded', '개인지출', false, false, true, 5)
on conflict (type, name) do nothing;
