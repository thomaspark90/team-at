-- 가든 오픈·마감 체크리스트 (2026-11-06 대표 결정).
--   · 항목(checklist_items)은 운영진이 앱에서 고친다 — 이 시드는 비어 있을 때 한 번만 들어가며, 사용자 수정을 덮어쓰지 않는다.
--   · 자동 제안은 저장하지 않는다. 그날의 근무표에서 가장 일찍 시작하는 사람 = 오픈, 가장 늦게 끝나는 사람 = 마감. 운영진 수정·대신 맡기만 저장한다.
--   · 판교 = 시트 '[Garden Service] 마감 메뉴얼' 대조본. 양재 = 판교 복사 + 월요일 업무 화요일 이동 + 마감 시각 표기 제거(제안).
--   · origin='proposal' 은 시트에 없던 제안 항목 — 꺼진 채(active=false) 들어간다.
-- 테이블은 전부 finance.*, RLS 켜고 정책 없음 — API(service role)만 접근. 권한 판정은 lib/checklist/access.ts.

create table if not exists finance.checklist_items (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  shift_type text not null check (shift_type in ('open', 'close')),
  section text not null,
  label text not null,
  detail text not null default '',
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'monthly')),
  weekday smallint check (weekday between 0 and 6), -- 0=일. weekly=그 요일, monthly=매월 첫 그 요일
  photo_required boolean not null default false,
  active boolean not null default true,
  origin text not null default 'app' check (origin in ('sheet', 'proposal', 'app')),
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  constraint checklist_item_weekday check ((frequency = 'daily') = (weekday is null))
);
comment on table finance.checklist_items is '오픈·마감 체크 항목. 지우지 않고 active=false 로 끈다(과거 기록이 참조).';
create index if not exists checklist_items_store_idx on finance.checklist_items (store, shift_type, sort_order);

create table if not exists finance.checklist_runs (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  work_date date not null,
  shift_type text not null check (shift_type in ('open', 'close')),
  submitted_at timestamptz,
  submitted_by_name text,
  items_snapshot jsonb, -- 제출 시점 항목 — 뒤에 항목을 고쳐도 그날 기록은 그대로 남는다
  created_at timestamptz not null default now(),
  unique (store, work_date, shift_type)
);
comment on table finance.checklist_runs is '지점·날짜·조별 체크리스트 1건. 같은 조는 한 장을 함께 채운다.';

create table if not exists finance.checklist_checks (
  id bigserial primary key,
  run_id bigint not null references finance.checklist_runs(id) on delete cascade,
  item_id bigint not null references finance.checklist_items(id),
  status text not null check (status in ('done', 'skipped')),
  skip_reason text,
  photo_path text,
  photo_taken_at timestamptz, -- 서버가 사진을 받은 시각
  photo_deleted_at timestamptz, -- 보관 기간(90일)이 지나 사진만 지운 시각
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text not null,
  done_at timestamptz not null default now(),
  unique (run_id, item_id),
  constraint checklist_skip_reason check (status <> 'skipped' or coalesce(trim(skip_reason), '') <> '')
);
comment on table finance.checklist_checks is '항목별 체크 — 누가 언제. 못 한 항목은 사유 필수.';

alter table finance.checklist_items enable row level security;
alter table finance.checklist_runs enable row level security;
alter table finance.checklist_checks enable row level security;
grant all on table finance.checklist_items, finance.checklist_runs, finance.checklist_checks to service_role;
grant usage, select on sequence finance.checklist_items_id_seq, finance.checklist_runs_id_seq, finance.checklist_checks_id_seq to service_role;


-- 조 수정(운영진)과 책임자 — 자동 제안 위에 덧씌운다.
create table if not exists finance.checklist_crew_overrides (
  store text not null check (store in ('pangyo', 'yangjae')),
  work_date date not null,
  shift_type text not null check (shift_type in ('open', 'close')),
  added_staff bigint[] not null default '{}',
  removed_staff bigint[] not null default '{}',
  lead_staff_id bigint references finance.schedule_staff(id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  primary key (store, work_date, shift_type)
);
comment on table finance.checklist_crew_overrides is '날짜별 조 인원·책임자 수정. 근무표 자체는 바꾸지 않는다.';

-- 대신 맡기 — 근무표는 바꾸지 않고 누가 언제 맡았는지만 남긴다.
create table if not exists finance.checklist_takeovers (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  work_date date not null,
  shift_type text not null check (shift_type in ('open', 'close')),
  staff_id bigint not null references finance.schedule_staff(id),
  staff_name text not null,
  taken_by uuid references auth.users(id) on delete set null,
  taken_at timestamptz not null default now(),
  unique (store, work_date, shift_type, staff_id)
);
comment on table finance.checklist_takeovers is '담당이 아닌 직원이 그날 조를 대신 맡은 기록.';

-- 다시 열기 기록 — 제출을 되돌린 사람·시각과 되돌리기 전 제출 내용.
create table if not exists finance.checklist_reopens (
  id bigserial primary key,
  run_id bigint not null references finance.checklist_runs(id) on delete cascade,
  reopened_by uuid references auth.users(id) on delete set null,
  reopened_by_name text not null,
  reopened_at timestamptz not null default now(),
  prev_submitted_at timestamptz,
  prev_submitted_by_name text
);
comment on table finance.checklist_reopens is '운영진이 당일 제출을 다시 연 기록.';

-- 책임자 자동 선정용 직원 태그 — 근무 역할(roles)과 별개.
alter table finance.schedule_staff
  add column if not exists duty_tag text check (duty_tag in ('manager', 'sub_manager'));

alter table finance.checklist_crew_overrides enable row level security;
alter table finance.checklist_takeovers enable row level security;
alter table finance.checklist_reopens enable row level security;
grant all on table finance.checklist_crew_overrides, finance.checklist_takeovers, finance.checklist_reopens to service_role;
grant usage, select on sequence finance.checklist_takeovers_id_seq, finance.checklist_reopens_id_seq to service_role;

insert into finance.checklist_items (store, shift_type, section, label, detail, frequency, weekday, active, origin, sort_order, photo_required)
select * from (values
  ('pangyo', 'open', '환경 · 평일 7:00', '창문 모두 열기', '', 'daily', null, true, 'sheet', 10, false),
  ('pangyo', 'open', '환경 · 평일 7:00', '문 모두 열기', '', 'daily', null, true, 'sheet', 20, false),
  ('pangyo', 'open', '환경 · 평일 7:00', '실링팬 모두 켜기', '', 'daily', null, true, 'sheet', 30, false),
  ('pangyo', 'open', '환경 · 평일 7:00', '공용 물 채우기', '', 'daily', null, true, 'sheet', 40, false),
  ('pangyo', 'open', '택배', '택배 정리', '언박싱 후 도착한 내용을 카톡에 공유하고 정리', 'daily', null, true, 'sheet', 50, false),
  ('pangyo', 'open', '베이킹 · 평일 7:20', '오븐 예열', '', 'daily', null, true, 'sheet', 60, false),
  ('pangyo', 'open', '베이킹 · 평일 7:20', '베이커리 오븐에 넣기', '예열 후', 'daily', null, true, 'sheet', 70, false),
  ('pangyo', 'open', '베이킹 · 평일 7:20', '오븐 트레이 배치', '', 'daily', null, true, 'sheet', 80, false),
  ('pangyo', 'open', '커피 세팅 · 평일 7:30', '호퍼 체결 및 원두 배치', '', 'daily', null, true, 'sheet', 90, false),
  ('pangyo', 'open', '커피 세팅 · 평일 7:30', '샤워스크린 결합', '', 'daily', null, true, 'sheet', 100, false),
  ('pangyo', 'open', '커피 세팅 · 평일 7:30', '스팀·머신·드라이 타월 세팅', '', 'daily', null, true, 'sheet', 110, false),
  ('pangyo', 'open', '커피 세팅 · 평일 7:30', '그라인더 개시', '전원을 켠 뒤 도징 두 번 버리기', 'daily', null, true, 'sheet', 120, false),
  ('pangyo', 'open', '커피 세팅 · 평일 7:30', '자동 탬퍼 전원 켜기', '', 'daily', null, true, 'sheet', 130, false),
  ('pangyo', 'open', '커피 세팅 · 평일 7:30', '커피퍽 트레이 잔여물 청소', '', 'daily', null, true, 'sheet', 140, false),
  ('pangyo', 'open', '바 세팅', '건조한 기물 재배치', '', 'daily', null, true, 'sheet', 150, false),
  ('pangyo', 'open', '바 세팅', '식기류 드라잉 타월로 닦아 배치', '', 'daily', null, true, 'sheet', 160, false),
  ('pangyo', 'open', '바 세팅', '접시 타월로 닦아 배치', '', 'daily', null, true, 'sheet', 170, false),
  ('pangyo', 'open', '바 세팅', '주서기 파츠 결합', '', 'daily', null, true, 'sheet', 180, false),
  ('pangyo', 'open', '바 세팅', '오렌지·레몬 슬라이스 만들기', '', 'daily', null, true, 'sheet', 190, false),
  ('pangyo', 'open', '바 세팅', '부족한 믹스처 만들기', '점심 러시 전까지', 'daily', null, true, 'sheet', 200, false),
  ('pangyo', 'open', '홀 · 평일 7:50', '테이블 행주로 닦기', '1·2층', 'daily', null, true, 'sheet', 210, false),
  ('pangyo', 'open', '홀 · 평일 7:50', '의자 상태 확인 및 청소', '', 'daily', null, true, 'sheet', 220, false),
  ('pangyo', 'open', '홀 · 평일 7:50', '의자 위치 정리 및 재배치', '', 'daily', null, true, 'sheet', 230, false),
  ('pangyo', 'open', '홀 · 평일 7:50', '쿠션 오염 확인', '', 'daily', null, true, 'sheet', 240, false),
  ('pangyo', 'open', '홀 · 평일 7:50', '아이패드·포스기·핸드폰 행주로 닦기', '', 'daily', null, true, 'sheet', 250, false),
  ('pangyo', 'open', '낮 업무 · 14:00~15:00', '화병 물 갈아주기', '', 'daily', null, true, 'sheet', 260, false),
  ('pangyo', 'open', '낮 업무 · 14:00~15:00', '건조 트레이 정리', '', 'daily', null, true, 'sheet', 270, false),
  ('pangyo', 'open', '낮 업무 · 14:00~15:00', '발주 필요 내용 정리', '카톡에 공유', 'daily', null, true, 'sheet', 280, false),
  ('pangyo', 'open', '낮 업무 · 14:00~15:00', '음료 베이스 파악 후 프렙', '', 'daily', null, true, 'sheet', 290, false),
  ('pangyo', 'open', '퇴근 전', '분리수거·종량제 버리기', '', 'daily', null, true, 'sheet', 300, false),
  ('pangyo', 'open', '퇴근 전', '설거지·핸들링', '', 'daily', null, true, 'sheet', 310, false),
  ('pangyo', 'open', '퇴근 전', '오렌지 착즙기 청소', '분리·세척·재결합, 아래쪽 행주로 닦기', 'daily', null, true, 'sheet', 320, false),
  ('pangyo', 'open', '이번 요일 업무', '쿠션 정리', '오염 확인 후 정리', 'weekly', 1, true, 'sheet', 330, false),
  ('pangyo', 'open', '이번 요일 업무', '트레이 세척 및 정리', '', 'weekly', 2, true, 'sheet', 340, false),
  ('pangyo', 'open', '이번 요일 업무', '컵 등 기간이 필요한 발주 파악', '', 'weekly', 3, true, 'sheet', 350, false),
  ('pangyo', 'open', '이번 요일 업무', '주방 조리대 하부장 청소 및 정리', '', 'weekly', 3, true, 'sheet', 360, false),
  ('pangyo', 'open', '이번 요일 업무', '시럽 펌프 분해·청소·건조', '', 'weekly', 5, true, 'sheet', 380, false),
  ('pangyo', 'open', '이번 요일 업무', '쓰레기통 세척', '', 'weekly', 0, true, 'sheet', 390, false),
  ('pangyo', 'open', '제안 항목', '밀크티 체에 거르기', '오전 10시쯤 — 12시간 냉침 후', 'daily', null, false, 'proposal', 400, false),
  ('pangyo', 'open', '제안 항목', '홍차 시럽·크림슨 베이스 거르기', '전날 만든 것이 있을 때', 'daily', null, false, 'proposal', 410, false),
  ('pangyo', 'open', '제안 항목', '냉장고 온도·유통기한 확인', '', 'daily', null, false, 'proposal', 420, false),
  ('pangyo', 'close', '커피 머신 · 평일 18:00', '샤워스크린 분해·약품 세척', '세척 후 건조, 결합은 오픈 때', 'daily', null, true, 'sheet', 430, true),
  ('pangyo', 'close', '커피 머신 · 평일 18:00', '그룹헤드 청소', '', 'daily', null, true, 'sheet', 440, false),
  ('pangyo', 'close', '커피 머신 · 평일 18:00', '스팀 완드 세척', '', 'daily', null, true, 'sheet', 450, false),
  ('pangyo', 'close', '커피 머신 · 평일 18:00', '머신 외부 행주로 세척', '', 'daily', null, true, 'sheet', 460, false),
  ('pangyo', 'close', '커피 머신 · 평일 18:00', '포터필터 청소', '', 'daily', null, true, 'sheet', 470, false),
  ('pangyo', 'close', '탬퍼·퍽 트레이', '자동 탬퍼 청소', '기기 안쪽까지 청소붓·청소기로', 'daily', null, true, 'sheet', 480, false),
  ('pangyo', 'close', '탬퍼·퍽 트레이', '커피퍽 트레이 잔여물 청소', '', 'daily', null, true, 'sheet', 490, false),
  ('pangyo', 'close', '그라인더 · 평일 18:20', '그라인더 외부 행주로 닦기', '', 'daily', null, true, 'sheet', 500, false),
  ('pangyo', 'close', '그라인더 · 평일 18:20', '호퍼 내 원두 전용 통으로 옮기기', '', 'daily', null, true, 'sheet', 510, false),
  ('pangyo', 'close', '그라인더 · 평일 18:20', '잔여 원두 진공 청소기로 흡입', '디카페인 제외', 'daily', null, true, 'sheet', 520, false),
  ('pangyo', 'close', '위생', '트레이 위생 상태 점검', '', 'daily', null, true, 'sheet', 530, false),
  ('pangyo', 'close', '위생', '라떼 스팀 행주 뜨거운 물로 세척', '', 'daily', null, true, 'sheet', 540, false),
  ('pangyo', 'close', '위생', '주방 조리대 행주로 닦기', '', 'daily', null, true, 'sheet', 550, false),
  ('pangyo', 'close', '위생', '건조대 비우기', '핸들링 완료 후 원위치', 'daily', null, true, 'sheet', 560, false),
  ('pangyo', 'close', '홀', '테이블 행주로 닦기', '1·2층', 'daily', null, true, 'sheet', 570, false),
  ('pangyo', 'close', '홀', '쿠션 오염 확인', '', 'daily', null, true, 'sheet', 580, false),
  ('pangyo', 'close', '홀', '의자 상태 확인 및 재배치', '', 'daily', null, true, 'sheet', 590, false),
  ('pangyo', 'close', '홀', '화분 낙엽 청소', '', 'daily', null, true, 'sheet', 600, false),
  ('pangyo', 'close', '홀', '호스 분사기 창고에 넣기', '', 'daily', null, true, 'sheet', 610, false),
  ('pangyo', 'close', '바닥 · 평일 18:40', '돌바닥 청소기', '', 'daily', null, true, 'sheet', 620, false),
  ('pangyo', 'close', '바닥 · 평일 18:40', '타일 바닥 청소기 후 물걸레', '', 'daily', null, true, 'sheet', 630, true),
  ('pangyo', 'close', '바닥 · 평일 18:40', '주방 카페트 청소기', '', 'daily', null, true, 'sheet', 640, false),
  ('pangyo', 'close', '쓰레기·행주', '음식물 쓰레기 버리기', '', 'daily', null, true, 'sheet', 650, false),
  ('pangyo', 'close', '쓰레기·행주', '행주 빨기', '', 'daily', null, true, 'sheet', 660, false),
  ('pangyo', 'close', '커틀러리', '커틀러리 통 비우고 세척', '세척 후 건조, 타올 건조해 비치', 'daily', null, true, 'sheet', 665, false),
  ('pangyo', 'close', '이번 요일 업무', '커피바 제빙기 청소', '', 'weekly', 6, true, 'sheet', 670, false),
  ('pangyo', 'close', '이번 요일 업무', '계산대 제빙기 청소', '', 'weekly', 0, true, 'sheet', 680, false),
  ('pangyo', 'close', '이번 요일 업무', '머신 트레이 세척', '', 'weekly', 2, true, 'sheet', 690, false),
  ('pangyo', 'close', '이번 요일 업무', '머신 위 컵 건조판 세척', '', 'weekly', 2, true, 'sheet', 700, false),
  ('pangyo', 'close', '이번 요일 업무', '퍽 트레이 물청소 및 건조', '바에서 꺼내서', 'weekly', 3, true, 'sheet', 710, false),
  ('pangyo', 'close', '이번 요일 업무', '호퍼 세척 및 건조', '장 앞에서 건조', 'weekly', 3, true, 'sheet', 720, false),
  ('pangyo', 'close', '이번 요일 업무', '디카페인 그라인더 진공 흡입', '', 'weekly', 3, true, 'sheet', 730, false),
  ('pangyo', 'close', '이번 요일 업무', '바닥 물걸레', '1·2층', 'weekly', 4, true, 'sheet', 740, false),
  ('pangyo', 'close', '이번 요일 업무', '벽 거미줄 청소', '', 'weekly', 4, true, 'sheet', 750, false),
  ('pangyo', 'close', '이번 요일 업무', '오염부 매직스펀지 청소', '', 'weekly', 4, true, 'sheet', 760, false),
  ('pangyo', 'close', '이번 요일 업무', '계단 청소', '청소기 → 물걸레 → 난간 행주', 'weekly', 5, true, 'sheet', 770, false),
  ('pangyo', 'close', '이번 요일 업무', '냉장고 내부 청소', '하부·미니 냉장고 바닥·벽, 상한 내용물 확인', 'weekly', 6, true, 'sheet', 780, false),
  ('pangyo', 'close', '이번 요일 업무', '설거지 바 내부 정리 및 청소', '', 'weekly', 0, true, 'sheet', 790, false),
  ('pangyo', 'close', '이번 요일 업무', '주방 상부 조리대 청소', '', 'weekly', 0, true, 'sheet', 800, false),
  ('pangyo', 'close', '이번 요일 업무', '안 쓰는 커틀러리 분류', '싱크 하부장으로', 'weekly', 0, true, 'sheet', 810, false),
  ('pangyo', 'close', '이번 요일 업무', '행주 삶기', '세제 풀고 뜨거운 물에 불린 후 삶기', 'weekly', 0, true, 'sheet', 820, false),
  ('pangyo', 'close', '이달 업무', '그라인더 분해 청소', '매월 첫 화요일', 'monthly', 2, true, 'sheet', 830, false),
  ('pangyo', 'close', '이달 업무', '그라인더 날 상태 확인', '매월 첫 화요일', 'monthly', 2, true, 'sheet', 840, false),
  ('pangyo', 'close', '제안 항목', '밀크티 냉침 시작', '오후 5시쯤, 제조일 표시 — 일주일 뒤 폐기', 'daily', null, false, 'proposal', 850, false),
  ('pangyo', 'close', '제안 항목', '포스 마감·정산', '', 'daily', null, false, 'proposal', 860, false),
  ('pangyo', 'close', '최종 확인', '오븐·식기세척기 전원 끄기', '', 'daily', null, true, 'proposal', 885, false),
  ('pangyo', 'close', '제안 항목', '경보 설정', '', 'daily', null, false, 'proposal', 880, false),
  ('pangyo', 'close', '최종 확인', '에어컨·조명·실링팬·스피커 끄기', '콘센트 확인', 'daily', null, true, 'sheet', 890, false),
  ('pangyo', 'close', '최종 확인', '2층 음악·조명 끄기', '', 'daily', null, true, 'sheet', 900, false),
  ('pangyo', 'close', '최종 확인', '수도 확인', '호스 잠김, 물새는 곳 없는지', 'daily', null, true, 'sheet', 910, false),
  ('pangyo', 'close', '최종 확인', '모든 냉장고 문 닫힘 확인', '', 'daily', null, true, 'sheet', 920, false),
  ('pangyo', 'close', '최종 확인', '창문 모두 잠금 확인', '', 'daily', null, true, 'sheet', 930, false),
  ('pangyo', 'close', '최종 확인', '문 모두 잠금 확인', '맨 마지막에', 'daily', null, true, 'sheet', 940, true),
  ('yangjae', 'open', '환경 · 평일 7:00', '창문 모두 열기', '', 'daily', null, true, 'sheet', 10, false),
  ('yangjae', 'open', '환경 · 평일 7:00', '문 모두 열기', '', 'daily', null, true, 'sheet', 20, false),
  ('yangjae', 'open', '환경 · 평일 7:00', '실링팬 모두 켜기', '', 'daily', null, true, 'sheet', 30, false),
  ('yangjae', 'open', '환경 · 평일 7:00', '공용 물 채우기', '', 'daily', null, true, 'sheet', 40, false),
  ('yangjae', 'open', '택배', '택배 정리', '언박싱 후 도착한 내용을 카톡에 공유하고 정리', 'daily', null, true, 'sheet', 50, false),
  ('yangjae', 'open', '베이킹 · 평일 7:20', '오븐 예열', '', 'daily', null, true, 'sheet', 60, false),
  ('yangjae', 'open', '베이킹 · 평일 7:20', '베이커리 오븐에 넣기', '예열 후', 'daily', null, true, 'sheet', 70, false),
  ('yangjae', 'open', '베이킹 · 평일 7:20', '오븐 트레이 배치', '', 'daily', null, true, 'sheet', 80, false),
  ('yangjae', 'open', '커피 세팅 · 평일 7:30', '호퍼 체결 및 원두 배치', '', 'daily', null, true, 'sheet', 90, false),
  ('yangjae', 'open', '커피 세팅 · 평일 7:30', '샤워스크린 결합', '', 'daily', null, true, 'sheet', 100, false),
  ('yangjae', 'open', '커피 세팅 · 평일 7:30', '스팀·머신·드라이 타월 세팅', '', 'daily', null, true, 'sheet', 110, false),
  ('yangjae', 'open', '커피 세팅 · 평일 7:30', '그라인더 개시', '전원을 켠 뒤 도징 두 번 버리기', 'daily', null, true, 'sheet', 120, false),
  ('yangjae', 'open', '커피 세팅 · 평일 7:30', '자동 탬퍼 전원 켜기', '', 'daily', null, true, 'sheet', 130, false),
  ('yangjae', 'open', '커피 세팅 · 평일 7:30', '커피퍽 트레이 잔여물 청소', '', 'daily', null, true, 'sheet', 140, false),
  ('yangjae', 'open', '바 세팅', '건조한 기물 재배치', '', 'daily', null, true, 'sheet', 150, false),
  ('yangjae', 'open', '바 세팅', '식기류 드라잉 타월로 닦아 배치', '', 'daily', null, true, 'sheet', 160, false),
  ('yangjae', 'open', '바 세팅', '접시 타월로 닦아 배치', '', 'daily', null, true, 'sheet', 170, false),
  ('yangjae', 'open', '바 세팅', '주서기 파츠 결합', '', 'daily', null, true, 'sheet', 180, false),
  ('yangjae', 'open', '바 세팅', '오렌지·레몬 슬라이스 만들기', '', 'daily', null, true, 'sheet', 190, false),
  ('yangjae', 'open', '바 세팅', '부족한 믹스처 만들기', '점심 러시 전까지', 'daily', null, true, 'sheet', 200, false),
  ('yangjae', 'open', '홀 · 평일 7:50', '테이블 행주로 닦기', '1·2층', 'daily', null, true, 'sheet', 210, false),
  ('yangjae', 'open', '홀 · 평일 7:50', '의자 상태 확인 및 청소', '', 'daily', null, true, 'sheet', 220, false),
  ('yangjae', 'open', '홀 · 평일 7:50', '의자 위치 정리 및 재배치', '', 'daily', null, true, 'sheet', 230, false),
  ('yangjae', 'open', '홀 · 평일 7:50', '쿠션 오염 확인', '', 'daily', null, true, 'sheet', 240, false),
  ('yangjae', 'open', '홀 · 평일 7:50', '아이패드·포스기·핸드폰 행주로 닦기', '', 'daily', null, true, 'sheet', 250, false),
  ('yangjae', 'open', '낮 업무 · 14:00~15:00', '화병 물 갈아주기', '', 'daily', null, true, 'sheet', 260, false),
  ('yangjae', 'open', '낮 업무 · 14:00~15:00', '건조 트레이 정리', '', 'daily', null, true, 'sheet', 270, false),
  ('yangjae', 'open', '낮 업무 · 14:00~15:00', '발주 필요 내용 정리', '카톡에 공유', 'daily', null, true, 'sheet', 280, false),
  ('yangjae', 'open', '낮 업무 · 14:00~15:00', '음료 베이스 파악 후 프렙', '', 'daily', null, true, 'sheet', 290, false),
  ('yangjae', 'open', '퇴근 전', '분리수거·종량제 버리기', '', 'daily', null, true, 'sheet', 300, false),
  ('yangjae', 'open', '퇴근 전', '설거지·핸들링', '', 'daily', null, true, 'sheet', 310, false),
  ('yangjae', 'open', '퇴근 전', '오렌지 착즙기 청소', '분리·세척·재결합, 아래쪽 행주로 닦기', 'daily', null, true, 'sheet', 320, false),
  ('yangjae', 'open', '이번 요일 업무', '쿠션 정리', '오염 확인 후 정리', 'weekly', 2, true, 'sheet', 330, false),
  ('yangjae', 'open', '이번 요일 업무', '트레이 세척 및 정리', '', 'weekly', 2, true, 'sheet', 340, false),
  ('yangjae', 'open', '이번 요일 업무', '컵 등 기간이 필요한 발주 파악', '', 'weekly', 3, true, 'sheet', 350, false),
  ('yangjae', 'open', '이번 요일 업무', '주방 조리대 하부장 청소 및 정리', '', 'weekly', 3, true, 'sheet', 360, false),
  ('yangjae', 'open', '이번 요일 업무', '시럽 펌프 분해·청소·건조', '', 'weekly', 5, true, 'sheet', 380, false),
  ('yangjae', 'open', '이번 요일 업무', '쓰레기통 세척', '', 'weekly', 0, true, 'sheet', 390, false),
  ('yangjae', 'open', '제안 항목', '밀크티 체에 거르기', '오전 10시쯤 — 12시간 냉침 후', 'daily', null, false, 'proposal', 400, false),
  ('yangjae', 'open', '제안 항목', '홍차 시럽·크림슨 베이스 거르기', '전날 만든 것이 있을 때', 'daily', null, false, 'proposal', 410, false),
  ('yangjae', 'open', '제안 항목', '냉장고 온도·유통기한 확인', '', 'daily', null, false, 'proposal', 420, false),
  ('yangjae', 'close', '커피 머신', '샤워스크린 분해·약품 세척', '세척 후 건조, 결합은 오픈 때', 'daily', null, true, 'sheet', 430, false),
  ('yangjae', 'close', '커피 머신', '그룹헤드 청소', '', 'daily', null, true, 'sheet', 440, false),
  ('yangjae', 'close', '커피 머신', '스팀 완드 세척', '', 'daily', null, true, 'sheet', 450, false),
  ('yangjae', 'close', '커피 머신', '머신 외부 행주로 세척', '', 'daily', null, true, 'sheet', 460, false),
  ('yangjae', 'close', '커피 머신', '포터필터 청소', '', 'daily', null, true, 'sheet', 470, false),
  ('yangjae', 'close', '탬퍼·퍽 트레이', '자동 탬퍼 청소', '기기 안쪽까지 청소붓·청소기로', 'daily', null, true, 'sheet', 480, false),
  ('yangjae', 'close', '탬퍼·퍽 트레이', '커피퍽 트레이 잔여물 청소', '', 'daily', null, true, 'sheet', 490, false),
  ('yangjae', 'close', '그라인더', '그라인더 외부 행주로 닦기', '', 'daily', null, true, 'sheet', 500, false),
  ('yangjae', 'close', '그라인더', '호퍼 내 원두 전용 통으로 옮기기', '', 'daily', null, true, 'sheet', 510, false),
  ('yangjae', 'close', '그라인더', '잔여 원두 진공 청소기로 흡입', '디카페인 제외', 'daily', null, true, 'sheet', 520, false),
  ('yangjae', 'close', '위생', '트레이 위생 상태 점검', '', 'daily', null, true, 'sheet', 530, false),
  ('yangjae', 'close', '위생', '라떼 스팀 행주 뜨거운 물로 세척', '', 'daily', null, true, 'sheet', 540, false),
  ('yangjae', 'close', '위생', '주방 조리대 행주로 닦기', '', 'daily', null, true, 'sheet', 550, false),
  ('yangjae', 'close', '위생', '건조대 비우기', '핸들링 완료 후 원위치', 'daily', null, true, 'sheet', 560, false),
  ('yangjae', 'close', '홀', '테이블 행주로 닦기', '1·2층', 'daily', null, true, 'sheet', 570, false),
  ('yangjae', 'close', '홀', '쿠션 오염 확인', '', 'daily', null, true, 'sheet', 580, false),
  ('yangjae', 'close', '홀', '의자 상태 확인 및 재배치', '', 'daily', null, true, 'sheet', 590, false),
  ('yangjae', 'close', '홀', '화분 낙엽 청소', '', 'daily', null, true, 'sheet', 600, false),
  ('yangjae', 'close', '홀', '호스 분사기 창고에 넣기', '', 'daily', null, true, 'sheet', 610, false),
  ('yangjae', 'close', '바닥', '돌바닥 청소기', '', 'daily', null, true, 'sheet', 620, false),
  ('yangjae', 'close', '바닥', '타일 바닥 청소기 후 물걸레', '', 'daily', null, true, 'sheet', 630, false),
  ('yangjae', 'close', '바닥', '주방 카페트 청소기', '', 'daily', null, true, 'sheet', 640, false),
  ('yangjae', 'close', '쓰레기·행주', '음식물 쓰레기 버리기', '', 'daily', null, true, 'sheet', 650, false),
  ('yangjae', 'close', '쓰레기·행주', '행주 빨기', '', 'daily', null, true, 'sheet', 660, false),
  ('yangjae', 'close', '커틀러리', '커틀러리 통 비우고 세척', '세척 후 건조, 타올 건조해 비치', 'daily', null, true, 'sheet', 665, false),
  ('yangjae', 'close', '이번 요일 업무', '커피바 제빙기 청소', '', 'weekly', 6, true, 'sheet', 670, false),
  ('yangjae', 'close', '이번 요일 업무', '계산대 제빙기 청소', '', 'weekly', 0, true, 'sheet', 680, false),
  ('yangjae', 'close', '이번 요일 업무', '머신 트레이 세척', '', 'weekly', 2, true, 'sheet', 690, false),
  ('yangjae', 'close', '이번 요일 업무', '머신 위 컵 건조판 세척', '', 'weekly', 2, true, 'sheet', 700, false),
  ('yangjae', 'close', '이번 요일 업무', '퍽 트레이 물청소 및 건조', '바에서 꺼내서', 'weekly', 3, true, 'sheet', 710, false),
  ('yangjae', 'close', '이번 요일 업무', '호퍼 세척 및 건조', '장 앞에서 건조', 'weekly', 3, true, 'sheet', 720, false),
  ('yangjae', 'close', '이번 요일 업무', '디카페인 그라인더 진공 흡입', '', 'weekly', 3, true, 'sheet', 730, false),
  ('yangjae', 'close', '이번 요일 업무', '바닥 물걸레', '1·2층', 'weekly', 4, true, 'sheet', 740, false),
  ('yangjae', 'close', '이번 요일 업무', '벽 거미줄 청소', '', 'weekly', 4, true, 'sheet', 750, false),
  ('yangjae', 'close', '이번 요일 업무', '오염부 매직스펀지 청소', '', 'weekly', 4, true, 'sheet', 760, false),
  ('yangjae', 'close', '이번 요일 업무', '계단 청소', '청소기 → 물걸레 → 난간 행주', 'weekly', 5, true, 'sheet', 770, false),
  ('yangjae', 'close', '이번 요일 업무', '냉장고 내부 청소', '하부·미니 냉장고 바닥·벽, 상한 내용물 확인', 'weekly', 6, true, 'sheet', 780, false),
  ('yangjae', 'close', '이번 요일 업무', '설거지 바 내부 정리 및 청소', '', 'weekly', 0, true, 'sheet', 790, false),
  ('yangjae', 'close', '이번 요일 업무', '주방 상부 조리대 청소', '', 'weekly', 0, true, 'sheet', 800, false),
  ('yangjae', 'close', '이번 요일 업무', '안 쓰는 커틀러리 분류', '싱크 하부장으로', 'weekly', 0, true, 'sheet', 810, false),
  ('yangjae', 'close', '이번 요일 업무', '행주 삶기', '세제 풀고 뜨거운 물에 불린 후 삶기', 'weekly', 0, true, 'sheet', 820, false),
  ('yangjae', 'close', '이달 업무', '그라인더 분해 청소', '매월 첫 화요일', 'monthly', 2, true, 'sheet', 830, false),
  ('yangjae', 'close', '이달 업무', '그라인더 날 상태 확인', '매월 첫 화요일', 'monthly', 2, true, 'sheet', 840, false),
  ('yangjae', 'close', '제안 항목', '밀크티 냉침 시작', '오후 5시쯤, 제조일 표시 — 일주일 뒤 폐기', 'daily', null, false, 'proposal', 850, false),
  ('yangjae', 'close', '제안 항목', '포스 마감·정산', '', 'daily', null, false, 'proposal', 860, false),
  ('yangjae', 'close', '제안 항목', '오븐·식기세척기 전원 끄기', '', 'daily', null, false, 'proposal', 870, false),
  ('yangjae', 'close', '제안 항목', '경보 설정', '', 'daily', null, false, 'proposal', 880, false),
  ('yangjae', 'close', '최종 확인', '에어컨·조명·실링팬·스피커 끄기', '콘센트 확인', 'daily', null, true, 'sheet', 890, false),
  ('yangjae', 'close', '최종 확인', '2층 음악·조명 끄기', '', 'daily', null, true, 'sheet', 900, false),
  ('yangjae', 'close', '최종 확인', '수도 확인', '호스 잠김, 물새는 곳 없는지', 'daily', null, true, 'sheet', 910, false),
  ('yangjae', 'close', '최종 확인', '모든 냉장고 문 닫힘 확인', '', 'daily', null, true, 'sheet', 920, false),
  ('yangjae', 'close', '최종 확인', '창문 모두 잠금 확인', '', 'daily', null, true, 'sheet', 930, false),
  ('yangjae', 'close', '최종 확인', '문 모두 잠금 확인', '맨 마지막에', 'daily', null, true, 'sheet', 940, false),
  ('yangjae', 'open', '제안 항목', '브런치바 세팅', '양재 전용 — 항목을 채워 켜 주세요', 'daily', null, false, 'proposal', 425, false),
  ('yangjae', 'close', '제안 항목', '브런치바 마감 정리', '양재 전용 — 항목을 채워 켜 주세요', 'daily', null, false, 'proposal', 885, false)
) as v(store, shift_type, section, label, detail, frequency, weekday, active, origin, sort_order, photo_required)
where not exists (select 1 from finance.checklist_items);

-- 탭 권한: 명시적 tabs 배열이 있는 계정은 새 탭이 기본 꺼짐 → 활성 프로필·스케줄 작성자에게 켠다.
update finance.garden_tab_access a
set tabs = array_append(a.tabs, 'checklist'), updated_at = now()
from auth.users u
where u.id = a.user_id
  and a.tabs is not null
  and not ('checklist' = any(a.tabs))
  and (
    lower(u.email) in (select email from finance.schedule_editors)
    or u.id in (select user_id from finance.profiles where status = 'active' and not roster_only)
  );

notify pgrst, 'reload schema';
