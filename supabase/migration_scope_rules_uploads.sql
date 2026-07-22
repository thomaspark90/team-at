-- 규칙·업로드 브랜드 분리 — 권한 분리 2차 후속. (멱등)
-- rules: 학습 규칙에 brand 차원 추가 — 같은 가맹점이라도 스탭밀/가든이 다른 계정과목을 쓸 수 있다.
--   기존 규칙은 전부 garden 백필(지금까지 학습은 사실상 가든 데이터 기반). 스탭밀 규칙은 담당자 분류로 새로 학습.
-- uploads: brand 컬럼 추가 — 스코프 멤버는 자기 브랜드 업로드 이력만 보인다. 기존·은행·카드·엑셀 업로드는 garden.
-- 두 테이블 RLS 정책에 my_brand_scope() 조건 결합 (스코프 null 이면 기존과 동일).
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전. ⚠️ 앱 배포 전에 먼저 실행할 것.

-- ---------- 1) rules ----------
alter table finance.rules
  add column if not exists brand text not null default 'garden'
  check (brand in ('staffmeal','garden'));

-- 자연키 교체: normalized_key → (normalized_key, brand)
alter table finance.rules drop constraint if exists rules_normalized_key_key;
do $$ begin
  alter table finance.rules
    add constraint rules_normalized_key_brand_key unique (normalized_key, brand);
exception
  when duplicate_table then null;
  when duplicate_object then null;
end $$;

drop policy if exists "rules rw" on finance.rules;
create policy "rules rw" on finance.rules for all
  using (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()))
  with check (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()));

-- ---------- 2) uploads ----------
alter table finance.uploads
  add column if not exists brand text not null default 'garden'
  check (brand in ('staffmeal','garden'));

drop policy if exists "uploads rw" on finance.uploads;
create policy "uploads rw" on finance.uploads for all
  using (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()))
  with check (finance.my_role() in ('admin','classifier')
    and (finance.my_brand_scope() is null or brand = finance.my_brand_scope()));
