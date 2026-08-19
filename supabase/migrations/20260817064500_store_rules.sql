-- 가맹점(정규화 키)별 지점 학습 규칙 — finance.rules(카테고리 학습)와 동일 패턴을
-- 지점(store) 축에 적용. '지점 미지정' 거래를 사람이 한 번 지정하면(브랜드·지점 이동 도구)
-- 같은 가맹점의 다음 수집 거래부터 자동으로 지점이 채워진다(2026-08-17).
create table if not exists finance.store_rules (
    id bigint not null,
    normalized_key text not null,
    brand text default 'garden'::text not null,
    store text not null,
    created_by uuid,
    hit_count integer default 0 not null,
    created_at timestamp with time zone default now() not null,
    constraint store_rules_brand_check check (brand = 'garden'::text),
    constraint store_rules_store_check check (store = any (array['pangyo'::text, 'yangjae'::text]))
);

create sequence if not exists finance.store_rules_id_seq
    start with 1
    increment by 1
    no minvalue
    no maxvalue
    cache 1;

alter sequence finance.store_rules_id_seq owned by finance.store_rules.id;

alter table only finance.store_rules alter column id set default nextval('finance.store_rules_id_seq'::regclass);

alter table only finance.store_rules
    add constraint store_rules_pkey primary key (id);

alter table only finance.store_rules
    add constraint store_rules_normalized_key_brand_key unique (normalized_key, brand);

alter table only finance.store_rules
    add constraint store_rules_created_by_fkey foreign key (created_by) references auth.users(id);

alter table finance.store_rules enable row level security;

drop policy if exists "store rules rw" on finance.store_rules;
create policy "store rules rw" on finance.store_rules
    using (
        (finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role]))
        and (finance.my_brand_scope() is null or finance.my_brand_scope() = 'garden'::text)
    )
    with check (
        (finance.my_role() = any (array['admin'::finance.member_role, 'classifier'::finance.member_role]))
        and (finance.my_brand_scope() is null or finance.my_brand_scope() = 'garden'::text)
    );

grant all on table finance.store_rules to anon;
grant all on table finance.store_rules to authenticated;
grant all on table finance.store_rules to service_role;

grant all on sequence finance.store_rules_id_seq to anon;
grant all on sequence finance.store_rules_id_seq to authenticated;
grant all on sequence finance.store_rules_id_seq to service_role;
