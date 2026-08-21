-- P1 감사 후속 (2026-08-21) — 두 가지:
--
-- 1) finance.dashboard_lumps — 지표 화면용 '미분해 지출 lump' 안전 뷰.
--    관리손익(buildPnl)은 ① 명세 미연결 카드대금 인출(cardLump) ② 세부 수집이 없는 달의
--    쿠팡·네이버페이 대체 출금(payLump)을 지출로 포함해 이익 과대를 막는데, 지표(aggregate)는
--    excluded 계정이라 통째로 건너뛰어 그 달 지표 EBIT만 낙관적으로 벌어졌다(감사 P4-7).
--    이 뷰가 (brand, ym, kind)별 lump 합을 내주고 지표가 EBIT에서 차감한다.
--    dashboard_tx 와 같은 definer 뷰(자체 my_role() 게이트) — viewer 도 memo 없이 읽는다.
--    ⚠ 판정 규칙은 lib/finance/pnlMonth.ts(cardReconcile·payLump)와 동기 유지할 것:
--      card    = '카드대금정산' 분류 인출 중 uploads.settled_tx_id 미연결분, 금액 = 출금−입금
--      subst   = '쿠팡대체'/'네이버페이대체' 출금 합 — 그 (brand, ym)에 해당 source 세부 수집이
--                하나도 없을 때만(있으면 세부가 대체하므로 lump 0)

create or replace view finance.dashboard_lumps as
with lump as (
  select t.id, t.brand, t.ym, c.name,
         t.amount_out, t.amount_out - t.amount_in as net
  from finance.transactions t
  join finance.categories c on c.id = t.category_id
  where c.type = 'excluded' and c.name in ('카드대금정산', '쿠팡대체', '네이버페이대체')
),
card as (
  select brand, ym, 'card'::text as kind, sum(net) as amount
  from lump l
  where l.name = '카드대금정산'
    and not exists (select 1 from finance.uploads u where u.settled_tx_id = l.id)
  group by 1, 2
),
subst as (
  select l.brand, l.ym,
         case when l.name = '쿠팡대체' then 'coupang' else 'naverpay' end as kind,
         sum(l.amount_out) as amount
  from lump l
  where l.name in ('쿠팡대체', '네이버페이대체')
    and not exists (
      select 1 from finance.transactions d
      where d.brand = l.brand and d.ym = l.ym
        and d.source = case when l.name = '쿠팡대체' then 'coupang' else 'naverpay' end
    )
  group by 1, 2, 3
)
select x.brand, x.ym, x.kind, x.amount
from (select * from card union all select * from subst) x
where finance.my_role() is not null
  and (finance.my_brand_scope() is null or x.brand = finance.my_brand_scope());

-- 읽기 전용 — 새 뷰에도 기본 GRANT ALL 이 붙으므로 즉시 회수(20260821080622 와 같은 규칙)
revoke insert, update, delete, truncate, references, trigger
  on finance.dashboard_lumps from anon, authenticated;
grant select on finance.dashboard_lumps to anon, authenticated;

-- 2) finance.monthly_category_totals — 가든 2지점 확정 시 2배 결함 수정(감사 P1-10).
--    monthly_close 는 가든이 (ym, brand, store) 로 지점당 한 행이라, (ym, brand) 로 조인하면
--    두 지점이 모두 확정된 달의 거래가 두 번 조인돼 sum 이 정확히 2배가 됐다.
--    '확정된 달' 집합을 distinct 로 접어 조인한다. security_invoker 는 기존대로 유지.

create or replace view finance.monthly_category_totals with (security_invoker = 'true') as
select t.ym,
       t.brand,
       c.type,
       c.name as category,
       sum(t.amount_in) as total_in,
       sum(t.amount_out) as total_out
from finance.transactions t
join finance.categories c on c.id = t.category_id
join (
  select distinct ym, brand from finance.monthly_close where status = 'confirmed'
) m on m.ym = t.ym and m.brand = t.brand
group by t.ym, t.brand, c.type, c.name;

revoke insert, update, delete, truncate, references, trigger
  on finance.monthly_category_totals from anon, authenticated;
