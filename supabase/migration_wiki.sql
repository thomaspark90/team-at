-- Coffee Wiki — 커피 지식베이스 스키마 (Phase 1)
-- 설계 스펙: docs/coffee-wiki-spec.md
--
-- 유튜버 30명 영상에서 주장(claim)을 추출해 토픽별로 교차검증하는 내부 위키.
-- finance 패턴을 따라 전용 스키마 `wiki` 에 격리. auth.users + finance.members(역할)만 공유.
-- Supabase SQL Editor 에 붙여넣고 실행. 여러 번 실행해도 안전(멱등).
--
-- 적용 순서:
--   1) 이 파일 실행
--   2) Settings → API → "Exposed schemas" 에 `wiki` 추가 (PostgREST 노출)
--
-- 파이프라인 권한 구조:
--   로컬 배치(yt-dlp+Claude 추출) → ingest API(service_role, RLS 우회)로 draft 적재
--   → 웹 승인 큐(/garden/wiki/review)에서 멤버가 승인/반려 (RLS 적용)

create schema if not exists wiki;
grant usage on schema wiki to anon, authenticated;
alter default privileges in schema wiki grant all on tables to anon, authenticated;
alter default privileges in schema wiki grant all on sequences to anon, authenticated;

-- 무인 수집기(ingest API)의 service_role 권한 (naverpay 패턴)
grant usage on schema wiki to service_role;
grant all on all tables in schema wiki to service_role;
grant all on all sequences in schema wiki to service_role;
alter default privileges in schema wiki grant all on tables to service_role;
alter default privileges in schema wiki grant all on sequences to service_role;

-- ---------- enums ----------
do $$ begin
  -- 검토 상태: 초안(AI 추출 직후) → 승인/반려. 외부 제안도 같은 흐름을 탄다(2차).
  create type wiki.review_status as enum ('draft','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 주장 간 관계: 동의/상충/보완/조건부(특정 조건에서만 성립)
  create type wiki.relation_type as enum ('agree','conflict','complement','conditional');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 제안 주체: AI 추출 / 내부 멤버 / 외부인(2차 확장 대비 선반영)
  create type wiki.proposer_kind as enum ('ai','member','external');
exception when duplicate_object then null; end $$;

-- ---------- 채널 (소스 유튜버 30선) ----------
create table if not exists wiki.channels (
  id                 bigserial primary key,
  youtube_channel_id text unique,                -- UC… (배치가 최초 수집 시 채움)
  handle             text unique,                -- @jameshoffmann 등
  name               text not null,
  host_name          text,
  subscriber_count   int,                        -- 근사치, 배치가 주기 갱신
  tags               text[] not null default '{}',  -- 분야: equipment/brewing/espresso/roasting/industry/barista/science
  is_retailer        boolean not null default false, -- 판매자 편향 표시(WLL·SCG·Clive 등)
  is_star            boolean not null default false, -- 장비 의견 교차검증 핵심 소스(⭐)
  language           text not null default 'en',    -- 자막 언어 힌트(en/ja/de…)
  active             boolean not null default true, -- false = 교체 이탈(데이터는 보존)
  note               text,
  created_at         timestamptz not null default now()
);

-- ---------- 영상 ----------
create table if not exists wiki.videos (
  id               bigserial primary key,
  channel_id       bigint not null references wiki.channels(id) on delete cascade,
  youtube_video_id text not null unique,          -- 11자 영상 ID
  title            text not null,
  published_at     timestamptz,
  duration_sec     int,
  transcript_lang  text,                          -- 실제 수집된 자막 언어
  fetched_at       timestamptz,                   -- 자막 수집 시각
  processed_at     timestamptz,                   -- 주장 추출 완료 시각(null=미처리)
  created_at       timestamptz not null default now()
);
create index if not exists videos_channel_idx on wiki.videos (channel_id, published_at desc);

-- ---------- 토픽 (시드 택소노미 + AI 제안) ----------
create table if not exists wiki.topics (
  id          bigserial primary key,
  slug        text not null unique,               -- ek43-grind-size 등 URL용
  title       text not null,                      -- 한국어 표기 제목
  parent_id   bigint references wiki.topics(id),  -- 상위 분류(시드는 최상위)
  description text,
  status      wiki.review_status not null default 'approved', -- AI 신규 제안은 draft
  proposer    wiki.proposer_kind not null default 'member',
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- 주장 (핵심 단위) ----------
create table if not exists wiki.claims (
  id             bigserial primary key,
  topic_id       bigint not null references wiki.topics(id),
  channel_id     bigint not null references wiki.channels(id),
  video_id       bigint not null references wiki.videos(id) on delete cascade,
  ts_start_sec   int,                             -- 근거 구간 시작(초)
  ts_end_sec     int,
  claim_ko       text not null,                   -- 한국어 요약 주장(승인 대상 본문)
  quote_original text,                            -- 원문 발췌(병기)
  context_note   text,                            -- 성립 조건·전제(예: "라이트 로스트 필터 한정")
  status         wiki.review_status not null default 'draft',
  proposer       wiki.proposer_kind not null default 'ai',
  proposed_by    uuid references auth.users(id),  -- proposer='member'일 때
  reviewed_by    uuid references auth.users(id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists claims_topic_status_idx on wiki.claims (topic_id, status);
create index if not exists claims_video_idx on wiki.claims (video_id);
create index if not exists claims_review_queue_idx on wiki.claims (status, created_at) where status = 'draft';

-- ---------- 주장 간 관계 (교차검증) ----------
create table if not exists wiki.claim_relations (
  id            bigserial primary key,
  from_claim_id bigint not null references wiki.claims(id) on delete cascade,
  to_claim_id   bigint not null references wiki.claims(id) on delete cascade,
  relation      wiki.relation_type not null,
  note          text,                             -- AI가 판단 근거 요약
  status        wiki.review_status not null default 'draft',
  proposer      wiki.proposer_kind not null default 'ai',
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (from_claim_id, to_claim_id),
  check (from_claim_id <> to_claim_id)
);
create index if not exists relations_to_idx on wiki.claim_relations (to_claim_id);

-- ---------- RLS ----------
-- 역할은 finance.members 재사용(같은 팀). 읽기=전 멤버, 승인·수정=admin.
-- (검토 롤 확대가 필요해지면 finance.member_role 'classifier' 허용으로 완화)
alter table wiki.channels        enable row level security;
alter table wiki.videos          enable row level security;
alter table wiki.topics          enable row level security;
alter table wiki.claims          enable row level security;
alter table wiki.claim_relations enable row level security;

do $$ begin
  create policy "channels read"  on wiki.channels  for select using (finance.my_role() is not null);
  create policy "channels write" on wiki.channels  for all
    using (finance.my_role() = 'admin') with check (finance.my_role() = 'admin');
  create policy "videos read"    on wiki.videos    for select using (finance.my_role() is not null);
  create policy "videos write"   on wiki.videos    for all
    using (finance.my_role() = 'admin') with check (finance.my_role() = 'admin');
  create policy "topics read"    on wiki.topics    for select using (finance.my_role() is not null);
  create policy "topics write"   on wiki.topics    for all
    using (finance.my_role() = 'admin') with check (finance.my_role() = 'admin');
  create policy "claims read"    on wiki.claims    for select using (finance.my_role() is not null);
  create policy "claims write"   on wiki.claims    for all
    using (finance.my_role() = 'admin') with check (finance.my_role() = 'admin');
  create policy "relations read"  on wiki.claim_relations for select using (finance.my_role() is not null);
  create policy "relations write" on wiki.claim_relations for all
    using (finance.my_role() = 'admin') with check (finance.my_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ---------- 시드 택소노미 (최상위 분류) ----------
insert into wiki.topics (slug, title, sort) values
  ('grinders',        '그라인더',        10),
  ('espresso',        '에스프레소 추출', 20),
  ('filter-brewing',  '필터/브루잉',     30),
  ('roasting',        '로스팅',          40),
  ('water',           '물',              50),
  ('beans-origin',    '원두/산지',       60),
  ('gear-comparison', '장비 비교',       70),
  ('maintenance',     '장비 정비/개조',  80),
  ('cafe-ops',        '카페 운영/바리스타', 90),
  ('industry',        '업계/트렌드',     100)
on conflict (slug) do nothing;

-- 하위 토픽 예시(EK43 등)는 배치가 AI 제안(draft)으로 만들거나 승인 큐에서 수동 추가.

-- ---------- 시드: 확정 소스 30선 (docs/coffee-wiki-spec.md 2026-07-22) ----------
-- youtube_channel_id·handle·구독자수는 배치가 YouTube Data API로 최초 수집 시 채운다.
-- 테이블이 비어 있을 때만 1회 적재(재실행 안전).
insert into wiki.channels (name, host_name, tags, is_retailer, is_star, language, note)
select * from (values
  -- 장비 교차검증 축 (14)
  ('James Hoffmann',          'James Hoffmann',    array['brewing','equipment','science','industry'], false, true,  'en', '기준점 소스'),
  ('Lance Hedrick',           'Lance Hedrick',     array['brewing','espresso','science','equipment'], false, true,  'en', '논문 기반 실험'),
  ('The Real Sprometheus',    null,                array['equipment','espresso'],                     false, true,  'en', '독립 리뷰어'),
  ('The Wired Gourmet',       null,                array['equipment','science'],                      false, true,  'en', '변인 통제형 그라인더 리뷰'),
  ('Tom''s Coffee Corner',    'Tom',               array['equipment','espresso'],                     false, true,  'en', '가성비·수리/개조'),
  ('Kyle Rowsell',            'Kyle Rowsell',      array['equipment','espresso','roasting'],          false, true,  'en', '가격대별 비교'),
  ('Whole Latte Love',        null,                array['equipment','espresso'],                     true,  true,  'en', '리테일러(편향 감안)'),
  ('Seattle Coffee Gear',     null,                array['equipment','brewing'],                      true,  true,  'en', '리테일러(편향 감안)'),
  ('The Coffee Chronicler',   'Asser Christensen', array['equipment','brewing'],                      false, true,  'en', 'Q그레이더 리뷰어'),
  ('Coffee Kev',              'Kev',               array['equipment'],                                false, true,  'en', '영국/유럽 관점'),
  ('Clive Coffee',            null,                array['equipment','espresso'],                     true,  true,  'en', '프리미엄숍(편향 감안)'),
  ('Coffee Fusion',           null,                array['equipment','espresso','barista'],           false, true,  'en', '호주 커피 스쿨'),
  ('Golden Brown Coffee',     'Rohan',             array['brewing','equipment','espresso'],           false, true,  'en', '보급형 현실론'),
  ('Artisti Coffee Roasters', 'Luke',              array['equipment','roasting','barista'],           false, true,  'en', '호주 로스터리'),
  -- 추출/에스프레소 기법 (6)
  ('morgandrinkscoffee',      'Morgan Eckroth',    array['barista','espresso'],                       false, false, 'en', '2022 US 바리스타 챔피언'),
  ('Emilee Bryant',           'Emilee Bryant',     array['espresso','equipment','barista'],           false, false, 'en', '홈바리스타 눈높이'),
  ('Hoon''s Coffee',          'Hoon',              array['barista','espresso'],                       false, false, 'en', '라떼아트·워크플로우'),
  ('European Coffee Trip',    'Aleš Pospíšil',     array['industry','brewing','equipment'],           false, false, 'en', '유럽 씬 취재'),
  ('Prima Coffee Equipment',  null,                array['equipment','brewing'],                      true,  false, 'en', '물 화학 등 교육'),
  ('Tetsu Kasuya',            '카스야 테츠',        array['brewing'],                                  false, false, 'ja', '4:6 메소드 원전'),
  -- 로스팅 (4)
  ('Mill City Roasters',      null,                array['roasting'],                                 false, false, 'en', '상업 로스팅 교육 표준'),
  ('Sweet Maria''s Coffee',   'Thompson Owen',     array['roasting','industry'],                      false, false, 'en', '홈로스팅·생두 고전'),
  ('Virtual Coffee Lab',      'Mike',              array['roasting'],                                 false, false, 'en', '홈로스터 체계 교육'),
  ('Kaffeemacher',            'Benjamin Hohlmann', array['equipment','roasting','science'],           false, true,  'de', '데이터 기반 장비 테스트'),
  -- 원두/업계/카페 운영 (6)
  ('Coffee with April',       'Patrik Rolf',       array['industry','roasting','brewing'],            false, false, 'en', '로스터리 경영·철학'),
  ('Tim Wendelboe',           'Tim Wendelboe',     array['industry','roasting'],                      false, false, 'en', '노르딕 권위 소스(간헐 업로드)'),
  ('Dak Coffee Roasters',     null,                array['industry','roasting'],                      false, false, 'en', '로스터리 브이로그'),
  ('Real Chris Baca',         'Chris Baca',        array['barista','industry'],                       false, false, 'en', '카페 운영 논평'),
  ('Brian Quan',              'Brian Quan',        array['barista','equipment'],                      false, false, 'en', '인터뷰·워크플로우'),
  ('CAFICT',                  null,                array['brewing'],                                  false, false, 'ja', '일본 라이프스타일(교체 후보: Onyx)')
) as seed(name, host_name, tags, is_retailer, is_star, language, note)
where not exists (select 1 from wiki.channels);
