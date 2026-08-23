-- 이스트파크(eastpark) 브랜드 신설 — 2026-08-23 대표 지시.
-- 가든서비스 두 지점(판교 2025-10, 양재천 그 이후) 운영 전, 같은 자리에서 운영하던 이전
-- 브랜드. 쿠팡·네이버 수집분 중 가든으로 귀속돼 있던 2025-09 이전(< '2025-09') 거래를
-- 전부 이스트파크로 이동한다. 신규 수집분은 ingest 의 시대 보정(lib/finance/era.ts)이 가른다.
-- personal 과 같은 원리로 사업 브랜드 세그먼트(BRANDS)·회계단위(UNITS)에는 넣지 않는다.

alter table finance.transactions drop constraint if exists transactions_brand_check;
alter table finance.transactions add constraint transactions_brand_check
  check (brand in ('staffmeal', 'garden', 'personal', 'eastpark'));

-- 분류 화면에서 이스트파크 행을 계정과목 분류하면 학습 규칙이 brand='eastpark' 로 쌓인다.
alter table finance.rules drop constraint if exists rules_brand_check;
alter table finance.rules add constraint rules_brand_check
  check (brand in ('staffmeal', 'garden', 'personal', 'eastpark'));

-- 가든 학습 규칙을 이스트파크로 복사 — 같은 사업장의 전신이라 가맹점→계정 매핑이 그대로
-- 유효하다. 이동된(그리고 앞으로 수집될) 이스트파크 행이 자동 분류되도록.
insert into finance.rules (normalized_key, brand, category_id, created_by)
select normalized_key, 'eastpark', category_id, created_by
  from finance.rules
 where brand = 'garden'
on conflict (normalized_key, brand) do nothing;

-- 일괄 이동 — 쿠팡·네이버 수집분에서 가든 귀속(배송지 판정·기본값·수동 모두)이던
-- 2025-09 이전 거래 전부. 대표 지시에 따른 확정이므로 brand_basis='manual'.
-- 지점(store)은 가든 전용 차원이라 비운다. branch(배송지 흔적 텍스트)는 참고용으로 보존.
-- 확정월 보호 — 원 브랜드(garden)·대상 브랜드(eastpark) 어느 쪽이든 확정된 달은 제외(현재 해당 없음, 안전장치).
update finance.transactions t
   set brand = 'eastpark', store = null, brand_basis = 'manual'
 where t.source in ('coupang', 'naverpay')
   and t.brand = 'garden'
   and t.ym < '2025-09'
   and not exists (
     select 1 from finance.monthly_close c
      where c.status = 'confirmed' and c.ym = t.ym and c.brand in ('garden', 'eastpark')
   );
