-- 역할·책임 태그를 운영진이 신설·편집(2026-11-06 대표 지시). key 는 schedule_staff.roles / duty_tag 에 저장되는 값이라 바꾸지 않는다.
-- kind 'role': 근무 역할(색 점), 'duty': 책임 태그(순서 = 체크리스트 책임자 우선순위).
create table if not exists finance.schedule_tags (
  kind text not null check (kind in ('role', 'duty')),
  key text not null,
  label text not null,
  color text,
  position int not null,
  primary key (kind, key)
);
alter table finance.schedule_tags enable row level security;

insert into finance.schedule_tags (kind, key, label, color, position) values
  ('role', 'bread', '제빵', '#F3EAD3', 1),
  ('role', 'pastry', '제과', '#F3EAD3', 2),
  ('role', 'cold', '콜드', '#3B82F6', 3),
  ('role', 'hot', '핫', '#EF4444', 4),
  ('role', 'barista', '커피', '#FACC15', 5),
  ('role', 'dish', '디쉬', '#22C55E', 6),
  ('duty', 'manager', '매니저', null, 1),
  ('duty', 'sub_manager', '서브 매니저', null, 2)
on conflict do nothing;

notify pgrst, 'reload schema';
