-- 가든 근무 스케줄 (2026-11-06 대표 결정). 구글 시트 '양재천점 근무 스케줄'을 앱으로 옮긴다.
--   · 계획(plan)과 실제(actual)를 따로 기록. 실제는 계획과 달라진 사람·날짜만 행을 만든다(없으면 계획 = 실제).
--   · 작성은 운영진(schedule_editors), 직원은 배포된 주의 계획만 본다(앱 탭 또는 지점별 읽기 전용 링크).
--   · 급여 계산·연봉은 넣지 않는다(버전 2).
-- 테이블은 전부 finance.*, RLS 켜고 정책 없음 — API(service role)만 접근. 권한 판정은 lib/schedule/access.ts.

create table if not exists finance.schedule_staff (
  id bigserial primary key,
  name text not null unique,
  home_store text not null default 'yangjae' check (home_store in ('pangyo', 'yangjae')),
  joined_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table finance.schedule_staff is '근무자 명부 — 로그인 계정과 무관(퇴사자·단기 인력 포함). 지점 간 이동 근무는 shifts.store 로 표현.';

create table if not exists finance.schedule_shifts (
  id bigserial primary key,
  work_date date not null,
  store text not null check (store in ('pangyo', 'yangjae')),
  staff_id bigint not null references finance.schedule_staff(id) on delete restrict,
  kind text not null check (kind in ('plan', 'actual')),
  start_min int,
  end_min int,
  is_off boolean not null default false, -- 실제 전용: 계획이 있었지만 근무하지 않음
  source text not null default 'app' check (source in ('app', 'sheet')),
  uncertain boolean not null default false, -- 원본 시트가 부정확하다고 밝힌 기록
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint schedule_shift_time check (
    (is_off and start_min is null and end_min is null)
    or (not is_off and start_min >= 0 and end_min <= 1440 and start_min < end_min
        and start_min % 30 = 0 and end_min % 30 = 0)
  ),
  constraint schedule_shift_off_actual check (not is_off or kind = 'actual')
);
comment on table finance.schedule_shifts is '근무 구간. 한 사람·하루에 여러 행 가능(분할근무). source=sheet 는 시트 이관분.';
create index if not exists schedule_shifts_date_idx on finance.schedule_shifts (work_date, store, kind);
create index if not exists schedule_shifts_staff_idx on finance.schedule_shifts (staff_id, work_date);

create table if not exists finance.schedule_weeks (
  store text not null check (store in ('pangyo', 'yangjae')),
  week_start date not null, -- 화요일
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  published_by text,
  primary key (store, week_start)
);
comment on table finance.schedule_weeks is '지점별 주간 배포 상태. 행 없음 = 작성 중. 주는 화~월(월요일 정기 휴무가 끝에 온다).';

create table if not exists finance.schedule_day_notes (
  store text not null check (store in ('pangyo', 'yangjae')),
  work_date date not null,
  note text not null,
  source text not null default 'app' check (source in ('app', 'sheet')),
  updated_at timestamptz not null default now(),
  primary key (store, work_date)
);
comment on table finance.schedule_day_notes is '날짜별 메모(운영진 전용). 시트 A열·보조표 원문을 보존.';

create table if not exists finance.leave_balances (
  staff_id bigint primary key references finance.schedule_staff(id) on delete cascade,
  total_days numeric(4, 1) not null check (total_days >= 0),
  as_of date not null,
  updated_at timestamptz not null default now()
);
comment on table finance.leave_balances is '연차 총개수(입력값, 자동 계산 아님). 잔여 = 총개수 − as_of 이후 연차 사용.';

create table if not exists finance.leave_records (
  id bigserial primary key,
  staff_id bigint not null references finance.schedule_staff(id) on delete cascade,
  leave_date date not null,
  type text not null check (type in ('annual', 'sick', 'off', 'sub_worked', 'sub_off')),
  note text not null default '',
  source text not null default 'app' check (source in ('app', 'sheet')),
  created_at timestamptz not null default now(),
  unique (staff_id, leave_date, type)
);
comment on table finance.leave_records is '연차·병가·오프·대체근무·대체휴무 기록. 대체 잔여 = sub_worked − sub_off.';

create table if not exists finance.schedule_share_links (
  store text primary key check (store in ('pangyo', 'yangjae')),
  token text not null unique,
  created_by text,
  created_at timestamptz not null default now()
);
comment on table finance.schedule_share_links is '지점별 읽기 전용 링크. 새로 만들면 이전 링크는 즉시 무효.';

create table if not exists finance.schedule_editors (
  email text primary key
);
comment on table finance.schedule_editors is '스케줄 작성·배포 권한 계정(대표는 항상 허용). 소문자 이메일.';

insert into finance.schedule_editors (email) values
  ('naeunjang@team-at.space'),
  ('yeonjaepark@team-at.space'),
  ('wooalee@team-at.space')
on conflict do nothing;
-- 박연재 님은 간편 계정(내부 이메일)도 쓴다 — 어느 쪽으로 들어와도 작성 가능하게
insert into finance.schedule_editors (email)
select lower(u.email) from finance.profiles p join auth.users u on u.id = p.user_id where p.display_name = '박연재'
on conflict do nothing;

do $$
declare t text;
begin
  foreach t in array array['schedule_staff','schedule_shifts','schedule_weeks','schedule_day_notes','leave_balances','leave_records','schedule_share_links','schedule_editors'] loop
    execute format('alter table finance.%I enable row level security', t);
    execute format('grant all on table finance.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence finance.schedule_staff_id_seq, finance.schedule_shifts_id_seq, finance.leave_records_id_seq to service_role;

-- 탭 권한: 명시적 tabs 배열이 있는 계정은 새 탭이 기본 꺼짐 → 운영진·매장 공용·간편 계정에 켠다.
update finance.garden_tab_access a
set tabs = array_append(a.tabs, 'schedule'), updated_at = now()
from auth.users u
where u.id = a.user_id
  and a.tabs is not null
  and not ('schedule' = any(a.tabs))
  and (
    lower(u.email) in (select email from finance.schedule_editors)
    or lower(u.email) in ('grdnsrvc_pangyo@team-at.space', 'grdnsrvc_yangjaecheon@team-at.space')
    or u.id in (select user_id from finance.profiles where simple_login and status = 'active')
  );
