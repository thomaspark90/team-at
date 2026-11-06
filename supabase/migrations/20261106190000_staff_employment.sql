-- 고용 형태·주 소정근로시간(2026-11-06 대표 결정) — 파트타이머는 법정 연차를 비례(주 소정근로시간/40)로 제안하고, 근무표에 작은 표시.
alter table finance.schedule_staff
  add column if not exists employment text not null default 'regular' check (employment in ('regular', 'part_time')),
  add column if not exists weekly_hours numeric(4,1) check (weekly_hours is null or (weekly_hours > 0 and weekly_hours <= 60));
update finance.schedule_staff set employment = 'part_time' where name in ('손빛찬', '김민주', '김민준') and active;
notify pgrst, 'reload schema';
