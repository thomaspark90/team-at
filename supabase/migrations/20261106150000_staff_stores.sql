-- 근무 지점 여러 개 — 운영진처럼 두 지점을 오가는 사람은 두 근무표에 다 나온다(2026-11-06 대표 지시).
-- home_store(기본 지점)는 그대로 두고 항상 stores 에 포함된다. 비어 있으면 앱이 [home_store]로 본다.
alter table finance.schedule_staff add column if not exists stores text[] not null default '{}';
update finance.schedule_staff set stores = array[home_store] where stores = '{}';
notify pgrst, 'reload schema';
