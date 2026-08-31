-- 계정과목 고정비/변동비 구분(cost_nature) — 지표 '고정비·변동비' 축 (2026-08-31).
--
-- 왜: 지표는 지출을 카테고리(재료비·인건비…)로만 보여줬고, 손익분기(BEP)는 '변동비=재료비+수수료,
-- 고정비=판관비 전체'로 코드에 박혀 있었다. 대표가 지출을 고정비/변동비로 나눠 보길 원했고
-- (2026-08-31), 어느 계정이 고정인지는 운영 판단이라 코드 상수가 아니라 계정과목 속성으로 둔다 —
-- 계정과목 화면에서 토글하면 지표·BEP가 따라온다.
--
-- 규칙:
--   · 값: 'fixed'(고정비) / 'variable'(변동비) / null(미지정)
--   · 하위 계정이 null 이면 상위 계정 값을 상속한다(코드: lib/finance/costNature.ts resolveCostNature)
--   · 최상위까지 null 이면 '미확정' — 미분류·미상과 같은 칸에 따로 보여준다(고정/변동 어느 쪽에도 안 섞음)
--   · 매출·영업외·손익제외 타입은 대상 아님(null 유지)
--
-- 초기값(2026-08-31 대표 결정):
--   · 재료비(cogs) 전부 → 변동
--   · 고정: 인건비(단기·일일용역 포함 — "고정으로 하되 그래프에 노트"), 임대료, 관리비(청소비 포함),
--          수도광열비("고정으로 하되 그래프에 노트"), 통신비, 보험료, 렌탈료, 세무기장료·로열티
--   · 변동: 그 외 판관비(지급수수료-카드·배달앱·PG, 광고비, 소모품비, 수선비, 세금과공과, 운반비, 잡비, 식비 …)

alter table finance.categories
  add column if not exists cost_nature text
  check (cost_nature is null or cost_nature in ('fixed', 'variable'));

comment on column finance.categories.cost_nature is
  '고정비(fixed)/변동비(variable) 구분. null=미지정(하위는 상위 상속, 최상위 null은 미확정). 지표·BEP가 사용.';

-- 재료비(원가) 전부 변동비
update finance.categories set cost_nature = 'variable'
 where type = 'cogs' and cost_nature is null;

-- 판관비 고정비 — 최상위 이름 기준(하위는 상속). '관리비 > 청소비'처럼 이름에 접두가 붙은 최상위도 포함.
update finance.categories set cost_nature = 'fixed'
 where type = 'sga' and parent_id is null and cost_nature is null
   and (name in ('인건비', '임대료', '관리비', '수도광열비', '통신비', '보험료', '렌탈료', '감가상각비')
        or name like '관리비 >%');

-- 지급수수료 하위 중 고정 성격(세무기장료·로열티)만 명시 — 나머지 하위(카드·배달앱·PG)는 상위(변동) 상속
update finance.categories set cost_nature = 'fixed'
 where type = 'sga' and cost_nature is null and name in ('세무기장료', '로열티');

-- 남은 판관비 최상위는 변동비
update finance.categories set cost_nature = 'variable'
 where type = 'sga' and parent_id is null and cost_nature is null;
