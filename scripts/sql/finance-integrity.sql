-- 재무 정합 일일 감시 (2026-08-23, 감사 후속 기능 ①) — infra-healthcheck 6번 항목이 실행.
-- 원칙: 앱 코드와 독립된 SQL 재계산으로 대사한다(같은 코드로 검증하면 같은 버그를 두 번 믿는다).
-- 결과가 0행이면 정상. 행이 나오면 (check, detail) 로 무엇이 어긋났는지 알려준다.
-- 2026-08-21 전면 감사에서 34개월 검증에 썼던 쿼리들의 상시화 — 규칙 변경 시 이 파일도 함께.
-- ⚠ 카드사 정규식은 lib/finance/cardOffset.ts CARD_COMPANIES 와 동기(아래 c8이 뷰와의 동기를 감시,
--   코드↔마이그레이션 동기는 tests/card-regex-sync.test.ts 가 감시).

with
-- c1) 전처리1 지출 합계 독립 재계산 vs 최신 결산 스냅샷 (확정 브랜드 전체)
tx as (
  select t.*, c.type::text as cat_type, c.name as cat_name
  from finance.transactions t
  left join finance.categories c on c.id = t.category_id
),
per as (
  select brand, ym,
    sum(case when coalesce(source,'bank') not in ('naverpay','coupang','card')
              and memo ~ '(비씨카드|BC바로카드|BC카드|현대카드|신한카드|삼성카드|국민카드|롯데카드|하나카드|우리카드)'
              and (amount_out - amount_in) > 0
              and coalesce(cat_name,'') <> '건별분할'
              and not (cat_type = 'excluded' and cat_name = '카드대금정산')
         then amount_out - amount_in else 0 end) as card_payment,
    sum(case when coalesce(source,'bank') not in ('naverpay','coupang','card')
              and not (memo ~ '(비씨카드|BC바로카드|BC카드|현대카드|신한카드|삼성카드|국민카드|롯데카드|하나카드|우리카드)'
                       and (amount_out - amount_in) > 0 and coalesce(cat_name,'') <> '건별분할')
              and cat_type in ('cogs','sga')
         then amount_out - amount_in else 0 end) as bank_direct,
    sum(case when source = 'naverpay' then amount_out - amount_in else 0 end) as naverpay,
    sum(case when source = 'coupang' then amount_out - amount_in else 0 end) as coupang,
    sum(case when source = 'card' and cat_type in ('cogs','sga') then amount_out - amount_in else 0 end) as card_stmt,
    sum(case when category_id is null and amount_out > 0
              and coalesce(source,'bank') not in ('naverpay','coupang')
              and not (memo ~ '(비씨카드|BC바로카드|BC카드|현대카드|신한카드|삼성카드|국민카드|롯데카드|하나카드|우리카드)')
         then amount_out else 0 end) as unclassified,
    sum(case
      when source = 'card' and cat_name = '미상' then amount_out - amount_in
      when coalesce(source,'bank') not in ('naverpay','coupang','card') and cat_name = '미상'
           and not (memo ~ '(비씨카드|BC바로카드|BC카드|현대카드|신한카드|삼성카드|국민카드|롯데카드|하나카드|우리카드)'
                    and (amount_out - amount_in) > 0)
      then amount_out - amount_in else 0 end) as misang
  from tx group by brand, ym
),
calc as (
  select brand, ym,
    bank_direct + greatest(card_payment - naverpay - coupang, 0) + naverpay + coupang + card_stmt + unclassified + misang as total
  from per
),
snap as (
  select distinct on (brand, store, ym) brand, store, ym,
    (figures->'expense'->>'total')::bigint as snap_total,
    (figures->'revenue'->>'pos')::bigint as snap_pos,
    (figures->>'txCount')::int as snap_txc
  from finance.close_snapshots
  order by brand, store, ym, version desc
),
-- 스냅샷은 (brand, store) 단위 — 브랜드 합계 비교는 지점 스냅샷 합으로
snap_brand as (
  select brand, ym, sum(snap_total) snap_total, sum(snap_pos) snap_pos, sum(snap_txc) snap_txc
  from snap group by brand, ym
),
confirmed as (
  select distinct brand, ym from finance.monthly_close where status = 'confirmed'
),
c1 as (
  select 'c1_전처리1_스냅샷_불일치' as check, c.brand || ' ' || c.ym || ': 재계산 ' || c.total || ' vs 스냅샷 ' || s.snap_total as detail
  from calc c
  join confirmed cf on cf.brand = c.brand and cf.ym = c.ym
  join snap_brand s on s.brand = c.brand and s.ym = c.ym
  where c.total <> s.snap_total
),
-- c2) 매출 정본(pos_sales + 식권) vs 스냅샷 + 결산 후 거래 수 변동
pos as (
  select brand, to_char(sale_date,'YYYY-MM') ym, sum(gross) g from finance.pos_sales group by 1,2
),
gift as (
  select brand, to_char(sale_date,'YYYY-MM') ym, sum(gross) g from finance.pos_gift_sales group by 1,2
),
txc as ( select brand, ym, count(*) c from finance.transactions group by 1,2 ),
c2 as (
  select 'c2_매출정본_또는_거래수_변동' as check,
    s.brand || ' ' || s.ym || ': pos 재계산 ' || (coalesce(p.g,0)+coalesce(g.g,0)) || ' vs 스냅샷 ' || s.snap_pos
      || ' · 거래수 ' || coalesce(t.c,0) || ' vs ' || s.snap_txc as detail
  from snap_brand s
  join confirmed cf on cf.brand = s.brand and cf.ym = s.ym
  left join pos p on p.brand = s.brand and p.ym = s.ym
  left join gift g on g.brand = s.brand and g.ym = s.ym
  left join txc t on t.brand = s.brand and t.ym = s.ym
  where coalesce(p.g,0)+coalesce(g.g,0) <> s.snap_pos or coalesce(t.c,0) <> s.snap_txc
),
-- c3) 전처리4 정합 — 상품별 합 = 일자별 매출. **지점 단위 비교**(가든은 지점별 파일이 따로라
--     브랜드 합으로 비교하면 상품별 미업로드 지점이 가짜 경고를 낸다 — 2026-08-23 첫 실행에서 확인).
--     그 지점·월에 상품별 파일이 있을 때만 대사한다(미업로드는 커버리지 보드 몫).
items as ( select brand, coalesce(store,'') st, to_char(sale_date,'YYYY-MM') ym, sum(gross) a from finance.pos_items group by 1,2,3 ),
pos_st as ( select brand, coalesce(store,'') st, to_char(sale_date,'YYYY-MM') ym, sum(gross) g from finance.pos_sales group by 1,2,3 ),
c3 as (
  select 'c3_전처리4_정합차이' as check,
    i.brand || '/' || coalesce(nullif(i.st,''),'-') || ' ' || i.ym || ': 품목 ' || i.a || ' vs 매출 ' || coalesce(s.g,0) as detail
  from items i left join pos_st s on s.brand = i.brand and s.st = i.st and s.ym = i.ym
  where i.a <> coalesce(s.g,0)
),
-- c4) 건별분할 정합 — 자식 합 = 부모 금액
c4 as (
  select 'c4_분할_자식합_불일치' as check,
    '#' || p.id || ' ' || p.ym || ': 부모 ' || p.amount_out || ' vs 자식합 ' || sum(ch.amount_out) as detail
  from finance.transactions p join finance.transactions ch on ch.split_parent_id = p.id
  group by p.id, p.ym, p.amount_out
  having p.amount_out <> sum(ch.amount_out)
),
-- c5) 기간 귀속 — ym 컬럼과 tx_at 월이 어긋나면 전처리(ym)와 지표(tx_at)가 다른 달에 귀속된다
c5 as (
  select 'c5_기간귀속_불일치' as check,
    brand || ' ' || ym || ' vs tx_at ' || to_char(tx_at,'YYYY-MM') || ' — ' || count(*) || '건' as detail
  from finance.transactions
  where ym <> to_char(tx_at,'YYYY-MM')
  group by brand, ym, to_char(tx_at,'YYYY-MM')
),
-- c6) 뷰 쓰기 권한 회수 유지 — anon/authenticated 에 SELECT 외 권한이 다시 생기면 원장 우회 쓰기 재발
c6 as (
  select 'c6_뷰_쓰기권한_재발' as check,
    table_name || ' → ' || grantee || ': ' || privilege_type as detail
  from information_schema.role_table_grants
  where table_schema = 'finance'
    and table_name in ('dashboard_tx','dashboard_pos','dashboard_pos_items','dashboard_lumps','monthly_category_totals')
    and grantee in ('anon','authenticated')
    and privilege_type <> 'SELECT'
),
-- c7) raw 정본층 보호 트리거 존재
c7 as (
  select 'c7_raw_보호트리거_소실' as check, missing as detail
  from (values ('raw_rows_no_referenced_delete'), ('raw_batches_no_referenced_delete'), ('raw_rows_no_update'), ('close_snapshots_no_update')) v(missing)
  where not exists (select 1 from pg_trigger t where t.tgname = v.missing and not t.tgisinternal)
),
-- c8) dashboard_tx 뷰 정의가 카드/부가세 판정 패턴을 유지하는지(뷰 재정의 사고 감지)
c8 as (
  select 'c8_뷰_판정패턴_소실' as check, p.name as detail
  from (values
    ('is_card_payment: 비씨카드|BC바로카드', '비씨카드|BC바로카드'),
    ('is_vat_payment: 부가가치세', '부가가치세')
  ) p(name, pat)
  where pg_get_viewdef('finance.dashboard_tx'::regclass) !~ p.pat
)
select * from c1
union all select * from c2
union all select * from c3
union all select * from c4
union all select * from c5
union all select * from c6
union all select * from c7
union all select * from c8;
