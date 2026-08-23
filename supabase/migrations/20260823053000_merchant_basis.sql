-- 가맹점 사전 판정(brand_basis='merchant') 도입 — 2026-08-23
-- 배송지가 아예 없는 결제(네이버 간편결제·디지털 상품 등)는 배송지 판정이 구조적으로 불가능하다.
-- 확정 이력(shipping·manual)이 100% 한 브랜드인 가맹점(정규화 키)이면 그 브랜드로 2차 판정하고,
-- 근거를 'merchant' 로 남긴다. 코드 쪽은 lib/finance/merchantBrand.ts + 쿠팡·네이버 ingest.

alter table finance.transactions drop constraint if exists transactions_brand_basis_check;
alter table finance.transactions add constraint transactions_brand_basis_check
  check (brand_basis is null or brand_basis in ('shipping', 'manual', 'default', 'merchant'));

-- 백필 1 — 브랜드는 이미 기본값(garden)을 벗어나 있는데 근거만 '미확정'으로 남은 행.
-- (분류 도구 밖 직접 정정의 흔적 — 사람이 옮긴 것이므로 도입 백필 규칙 2와 같은 논리로 manual 확정)
update finance.transactions
   set brand_basis = 'manual'
 where source in ('coupang', 'naverpay') and brand_basis = 'default' and brand <> 'garden';

-- 백필 2 — 남은 귀속 미확정(garden 기본값) 행을 가맹점 사전으로 판정.
-- 사전 조건: 확정 이력(shipping·manual)이 3건 이상이고 100% 한 브랜드. 지점(branch/store)은
-- 이력이 만장일치일 때만 물려받는다. 확정월(monthly_close confirmed)은 양쪽 브랜드 모두 보호.
-- 계정과목은 대상 브랜드의 학습 규칙으로 갈아끼우고, 규칙이 없으면 미분류로 되돌려
-- 그 브랜드의 분류 큐에 다시 나타나게 한다('미상' 파킹 계정이 남지 않도록).
with dict as (
  select normalized_key,
         min(brand) as brand,
         count(*) as evidence,
         case when min(coalesce(branch, '∅')) = max(coalesce(branch, '∅')) then min(branch) end as branch,
         case when min(coalesce(store,  '∅')) = max(coalesce(store,  '∅')) then min(store)  end as store
    from finance.transactions
   where source in ('coupang', 'naverpay') and brand_basis in ('shipping', 'manual')
   group by normalized_key
  having count(distinct brand) = 1 and count(*) >= 3
)
update finance.transactions t
   set brand = d.brand,
       branch = d.branch,
       store = d.store,
       brand_basis = 'merchant',
       category_id = r.category_id,
       classified_at = case when r.category_id is null then null else t.classified_at end
  from dict d
  left join finance.rules r
    on r.normalized_key = d.normalized_key and r.brand = d.brand
 where t.source in ('coupang', 'naverpay')
   and t.brand_basis = 'default'
   and t.normalized_key = d.normalized_key
   and not exists (
     select 1 from finance.monthly_close c
      where c.status = 'confirmed' and c.ym = t.ym and c.brand in (t.brand, d.brand)
   );
