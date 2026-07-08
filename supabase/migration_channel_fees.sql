-- 채널수수료(월별) — 관리손익의 '공급가액 매출 − 채널수수료 = 순매출'용.
-- 정산서(카드사·간편결제·배달앱)에서 나온 그 달 총 수수료를 월별로 입력.
-- 미입력 달은 코드에서 공급가액×기본율(CHANNEL_FEE_RATE)로 추정 표시.
-- 멱등: create ... if not exists. 프로덕션 SQL Editor에서 1회 실행.

create table if not exists finance.channel_fees (
  ym          text primary key,             -- 'YYYY-MM'
  amount      bigint not null default 0,    -- 그 달 채널수수료 총액(정산서 실제)
  entered_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

alter table finance.channel_fees enable row level security;

drop policy if exists "channel_fees rw" on finance.channel_fees;
create policy "channel_fees rw" on finance.channel_fees for all
  using (finance.my_role() in ('admin','classifier'))
  with check (finance.my_role() in ('admin','classifier'));
