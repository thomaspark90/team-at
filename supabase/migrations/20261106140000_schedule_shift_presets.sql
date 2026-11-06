-- 근무 파트(칸 편집기의 버튼) — 지점별로 운영진이 고친다(2026-11-06 대표 지시). 코드 상수 SHIFT_PRESETS 는 초기값.
create table if not exists finance.schedule_shift_presets (
  id bigserial primary key,
  store text not null,
  position int not null,
  label text not null,
  start_min int not null,
  end_min int not null,
  check (start_min >= 0 and end_min <= 1440 and start_min < end_min)
);
alter table finance.schedule_shift_presets enable row level security;
create index if not exists schedule_shift_presets_store_idx on finance.schedule_shift_presets (store, position);

insert into finance.schedule_shift_presets (store, position, label, start_min, end_min)
select s.store, p.position, p.label, p.start_min, p.end_min
from (values ('yangjae'), ('pangyo')) as s(store)
cross join (values
  (1, '오픈', 420, 960), (2, '오전 파트', 420, 840), (3, '마감', 600, 1140),
  (4, '야간', 780, 1320), (5, '주말 긴 근무', 660, 1320), (6, '저녁 파트', 1020, 1320)
) as p(position, label, start_min, end_min)
where not exists (select 1 from finance.schedule_shift_presets x where x.store = s.store);

notify pgrst, 'reload schema';
