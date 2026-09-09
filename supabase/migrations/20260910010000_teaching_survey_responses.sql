-- 스탭 설문(탈리) 응답 자동 반영 (2026-09-10 대표 지시).
-- 탈리 웹훅(FORM_RESPONSE) → /api/garden-teaching/survey/ingest 가 서명 검증 후 여기에 적재.
-- 코드 상수(lib/teaching/survey-results.ts)로 옮겨 적던 것을 대체 — 교육 탭 '설문 결과'는 이 테이블을 읽는다.
--   · submission_id 로 멱등(탈리 재전송·수정 시 덮어씀)
--   · topics/priorities 는 lib/teaching/topics.ts 키. 목록에 없는 직접 입력은 custom 에 원문, 순위에서 고르면 'custom'.
--   · applied_user_id: 응답 이름과 같은 지점 명부 프로필에 위시·순위·메모를 자동 반영했을 때 그 계정(없으면 명부에 새로 등록).

create table if not exists finance.teaching_survey_responses (
  id bigserial primary key,
  store text not null check (store in ('pangyo', 'yangjae')),
  form_id text not null,
  submission_id text not null unique,
  respondent_name text not null,
  submitted_at timestamptz not null,
  topics text[] not null default '{}',
  custom text[] not null default '{}',
  priorities text[] not null default '{}',
  note text not null default '',
  raw jsonb,
  applied_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table finance.teaching_survey_responses is '탈리 설문 응답(웹훅 적재). 교육 탭 설문 결과·명부 자동 반영의 원천.';
create index if not exists teaching_survey_responses_store_idx on finance.teaching_survey_responses (store, submitted_at desc);

alter table finance.teaching_survey_responses enable row level security;
grant all on table finance.teaching_survey_responses to service_role;
grant usage, select on sequence finance.teaching_survey_responses_id_seq to service_role;

-- 웹훅 이전에 들어온 응답 3건(2026-09-09, 탈리 Submissions 에서 옮김) — submission_id 는 탈리 값을 모르므로 seed 접두.
insert into finance.teaching_survey_responses (store, form_id, submission_id, respondent_name, submitted_at, topics, custom, priorities, note) values
  ('pangyo', 'Bzy5WQ', 'seed-2026-09-09-이진희', '이진희', '2026-09-09 10:55+09',
   '{filter-brewing,quality-check,cupping,milk-alternatives,latte-art,milk-steaming,water-temp,espresso-dialing,ek43-grind,complaint}',
   '{}', '{latte-art,filter-brewing,espresso-dialing}', '아직은 없습니다.'),
  ('pangyo', 'Bzy5WQ', 'seed-2026-09-09-김보영', '김보영', '2026-09-09 11:06+09',
   '{espresso-dialing,filter-brewing,ek43-grind,water-temp,milk-steaming,latte-art,milk-alternatives,cupping,bean-explaining,quality-check,machine-cleaning,troubleshooting,water-maintenance,bean-recommend,complaint,peak-flow}',
   '{"실무방식 (어떤 방식·어떤 순서로 일하시는지, 돌발상황 시 어떤 방식으로 해결하시는지)","업무 지적 (근무자들 근무 시 잘못된 점, 불필요한 행동과 비효율적인 방식 교정)"}',
   '{espresso-dialing,custom,milk-steaming}', '1번 항목의 직접 추가 사항을 참고해 주세요.')
on conflict (submission_id) do nothing;
