-- 지점별 근무자 명부 + 배우고 싶은 것 우선순위 (2026-09-09 대표 지시).
--
-- 왜: 스탭이 앱에 가입하지 않아도 대표·매니저가 지점 근무자를 이름만으로 등록해 교육 일정의 교육 대상으로 고르고,
-- 설문(탈리)으로 걷은 '배우고 싶은 것·우선순위·메모'를 대신 적어 티칭 스태프가 세부 정보를 보게 한다.
--
--   · profiles.roster_only = true : 명부 등록 계정(로그인 없음). auth 계정은 내부 이메일로 만들어 두고(교육 대상·기록 FK 때문),
--     나중에 설정에서 '로그인 열기'(비밀번호 발급)를 하면 simple_login=true 로 바뀌어 본인이 들어올 수 있다.
--   · teaching_wishes.priority : 1·2·3 = 꼭 먼저 배우고 싶은 순서(설문 1~3순위). null = 순위 없음.

alter table finance.profiles
  add column if not exists roster_only boolean not null default false;
comment on column finance.profiles.roster_only is '명부만 등록(로그인 없음). 설정에서 로그인 열기 시 false+simple_login=true.';

alter table finance.teaching_wishes
  add column if not exists priority smallint
  check (priority is null or priority between 1 and 3);
comment on column finance.teaching_wishes.priority is '1~3 = 먼저 배우고 싶은 순서(설문 순위). null = 순위 없음.';
