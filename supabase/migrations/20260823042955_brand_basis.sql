-- 브랜드 귀속 근거(brand_basis) — 수집 거래(쿠팡·네이버페이)의 brand 가 어떻게 정해졌는지 기록.
--   'shipping' = 수집기가 배송지로 자동 판정
--   'manual'   = 사용자가 분류 화면(브랜드·지점 이동)에서 직접 확정
--   'default'  = 배송지 미해석 → DB 기본값(garden)으로 들어간 '귀속 미확정' 건
-- 배경(2026-08-23): 기본값 garden 이 배송지 판정분과 DB에서 구분되지 않아, 가든 오픈 전
-- 스탭밀·개인 지출(쿠팡 141건 등)이 가든 장부에 조용히 쌓였다. 이 컬럼이 미확정 건을
-- 분류 화면의 '귀속 미확정' 큐로 드러내고, 확정되면 manual 로 남는다.
alter table finance.transactions
  add column if not exists brand_basis text
  check (brand_basis is null or brand_basis in ('shipping', 'manual', 'default'));

-- 백필 — 수집분(쿠팡·네이버페이)만 대상. 은행·카드·엑셀은 업로드 맥락에서 브랜드가
-- 정해지므로 null 유지(귀속 개념이 수집분에만 적용된다).
-- 1) 배송지 판정 흔적(branch)이 있으면 shipping
update finance.transactions set brand_basis = 'shipping'
 where source in ('coupang', 'naverpay') and brand_basis is null and branch is not null;
-- 2) 배송지 흔적 없이 기본값(garden·지점 없음)을 벗어나 있으면 사용자가 옮긴 것 → manual
update finance.transactions set brand_basis = 'manual'
 where source in ('coupang', 'naverpay') and brand_basis is null
   and (brand <> 'garden' or store is not null);
-- 3) 나머지 = 기본값으로 굳은 귀속 미확정
update finance.transactions set brand_basis = 'default'
 where source in ('coupang', 'naverpay') and brand_basis is null;
