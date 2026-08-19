-- raw_batches.brand 를 nullable 로 — 2026-08-19.
--
-- 쿠팡·네이버페이 수집분은 한 번의 수집(배치) 안에 스탭밀·가든 건이 섞여 들어온다(브랜드는
-- 배송지로 행마다 판정). 배치에 브랜드를 하나 박으면 거짓이 되므로, 섞인 배치는 null 로 둔다.
-- null = '행마다 다름'. 조회 권한은 전체 브랜드 범위를 가진 사람(my_brand_scope() is null)만.
alter table finance.raw_batches alter column brand drop not null;

drop policy if exists "raw batches rw" on finance.raw_batches;
create policy "raw batches rw" on finance.raw_batches
  using (
    finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
    and (
      finance.my_brand_scope() is null                      -- 전체 범위: 섞인 배치도 볼 수 있다
      or (brand is not null and finance.my_brand_scope() = brand)
    )
  )
  with check (
    finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
    and (
      finance.my_brand_scope() is null
      or (brand is not null and finance.my_brand_scope() = brand)
    )
  );

drop policy if exists "raw rows rw" on finance.raw_rows;
create policy "raw rows rw" on finance.raw_rows
  using (
    exists (
      select 1 from finance.raw_batches b
      where b.id = raw_rows.batch_id
        and finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
        and (
          finance.my_brand_scope() is null
          or (b.brand is not null and finance.my_brand_scope() = b.brand)
        )
    )
  )
  with check (
    exists (
      select 1 from finance.raw_batches b
      where b.id = raw_rows.batch_id
        and finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role])
        and (
          finance.my_brand_scope() is null
          or (b.brand is not null and finance.my_brand_scope() = b.brand)
        )
    )
  );
