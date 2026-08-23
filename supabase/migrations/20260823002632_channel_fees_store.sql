-- 채널수수료 지점 차원 추가 (2026-08-23, 가든 복제 G5 선행).
--
-- 가든은 지점별 별개 회계(대표 확정 2026-08-22)인데 수수료 실입력이 (ym, brand) 단위라,
-- 양재천(토스)·판교(페이히어)처럼 정산 주체가 다른 지점의 실액을 따로 넣을 수 없었고
-- 브랜드 입력값이 두 지점에 매출비율로 안분(근사)됐다.
-- store = '' 는 기존 브랜드 단위 입력(레거시 — 지점 뷰에선 계속 안분), 'yangjae'/'pangyo' 는
-- 지점 실액. 스탭밀은 지점이 없어 항상 ''.

alter table finance.channel_fees
  add column if not exists store text not null default '';

alter table finance.channel_fees
  drop constraint if exists channel_fees_store_check;
alter table finance.channel_fees
  add constraint channel_fees_store_check check (store in ('', 'yangjae', 'pangyo'));

-- PK (ym, brand) → (ym, brand, store) — 기존 행은 store='' 로 그대로 유지된다
alter table finance.channel_fees drop constraint if exists channel_fees_pkey;
alter table finance.channel_fees add constraint channel_fees_pkey primary key (ym, brand, store);
