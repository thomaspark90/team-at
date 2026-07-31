-- 개인(personal) 브랜드 추가 — 사업 계정으로 결제한 사적 지출 세그먼트. (멱등)
-- transactions.brand 는 enum 이 아니라 CHECK 제약이므로, 기존 brand CHECK 를 찾아 드롭하고
-- 'personal' 을 포함해 다시 건다. 여러 번 실행해도 안전.
--
-- 개인 지출은 손익 제외(관리손익·EBIT·대시보드 어디에도 안 잡힘): 실제 손익 제외는 '개인지출'
-- excluded 카테고리(migration_personal_expense_category.sql)가 담당하고, brand='personal' 은
-- 회계단위 탭 '개인'에서 채널·월별로 모아 보는 세그먼트 축이다.
-- pos_sales/inventory/channel_fees 의 brand CHECK 는 건드리지 않는다(개인은 매출·재고·채널수수료 없음).

do $$
declare c record;
begin
  -- transactions 에 걸린 기존 brand CHECK 제약(이름이 무엇이든) 전부 제거
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'finance' and rel.relname = 'transactions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%brand%'
  loop
    execute format('alter table finance.transactions drop constraint %I', c.conname);
  end loop;

  alter table finance.transactions
    add constraint transactions_brand_check check (brand in ('staffmeal', 'garden', 'personal'));
end $$;
