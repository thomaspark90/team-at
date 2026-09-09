# 간편 계정 · 매니저 교육 — 운영 메모 (2026-09-07)

## 간편 계정 (이름 + 숫자 6자리)
- **가입 신청(기본 경로)**: 로그인 화면 › "가입 신청" — 성 포함 한글 3글자 + 본인이 정한 6자리 → `POST /api/simple-signup`(PUBLIC_API). `profiles.status='pending'` 으로 생성되며 로그인은 막힌다. 대표가 `/settings` › 간편 계정 › **승인 대기**에서 역할·지점을 지정해 승인(`status='active'`)하면 열린다. 거절 = 계정 삭제. 승인 대기 상한 50건(도배 방어).
- 발급(대표가 직접): `/settings` › 간편 계정. 이름·역할(스탭/매니저)·지점. 발급 직후 뜨는 6자리는 **그 자리에서 본인에게 전달** — 저장하지 않는다.
- 첫 로그인은 `/account/pin` 으로 보내져 본인이 새 6자리를 정한다. 잊으면 설정에서 **비밀번호 초기화**(새 6자리 발급).
- 로그인 화면(`/`)의 구글 버튼 아래 폼 → `POST /api/simple-login`(PUBLIC_API). 5회 연속 실패 → 10분 잠금(`profiles.locked_until`).
- 내부 구조: Supabase 이메일/비밀번호 계정. 이메일은 `acct-<랜덤>@team-at.space`(팀 도메인이라 미들웨어 허용 통과, 구글 로그인 불가).
  저장 비밀번호 = `sha256(SIMPLE_LOGIN_PEPPER : 이메일 : PIN)` — **`SIMPLE_LOGIN_PEPPER` env 를 바꾸면 모든 간편 계정이 로그인 불가**(전원 초기화 필요). Vercel production 과 `.env.local` 에 동일 값.
- 발급 기본 권한: 가든 섹션 + 교육 탭(`garden_tab_access`). 넓히려면 페이지 접근 권한에서 토글.
- 삭제: 설정 › 간편 계정 › 삭제 — auth 계정과 프로필·요청·일정·기록이 함께 지워진다.

## 역할 (`finance.profile_roles`, 2026-09-09)
- 설정 › 간편 계정 › **역할 관리**에서 대표가 추가·이름 변경·삭제. 기본 역할 스탭(`staff`)·매니저(`manager`)는 삭제 불가, 사용 중인 역할도 삭제 불가.
- 역할의 의미는 **교육 운영(can_manage)** 하나뿐: 켜짐 → 매니저 화면(출근 일정·집계·교육함 기록), 꺼짐 → 스탭 화면(위시리스트)·참석자 후보·전날 알림 대상.
- 코드는 역할 키를 직접 비교하지 않는다(`lib/teaching/access.ts` Actor.manage / manageKeys). 새 역할을 만들어도 코드 수정 불필요.

## 지점 근무자 명부 (2026-09-09)
- 교육 탭(운영 권한) › **지점 근무자**: 이름·지점만으로 등록 → `profiles.roster_only=true`(auth 계정은 내부 이메일로 생성, 비밀번호는 아무도 모름). 즉시 교육 대상 선택지·지점 집계에 포함.
- **세부 정보 편집**: 대표가 설문(탈리) 결과를 대신 옮긴다 — 배우고 싶은 것 체크 + ①②③ 순위(`teaching_wishes.priority`) + 메모(`teaching_notes`). 일정 카드에 교육 대상별로 "이름 · ①주제 · ②주제 …"로 보인다.
- 본인 로그인이 필요해지면 설정 › 간편 계정 › **로그인 열기(비밀번호 발급)** → `simple_login=true, roster_only=false`.
- 명부 등록 계정 삭제는 명부에서(가입·발급 계정은 설정에서). API: `/api/garden-teaching/staff`.

## 시간 칸별 참여 인원 (2026-09-09)
- 일정 카드의 시간 칸마다 참여 스탭을 고른다(`teaching_shift_slot_trainees`). 대표만 편집(칸 옆 이름 칩), 티칭 스태프는 이름만 본다.
- 일정의 교육 대상 = 일정 단위 지정 ∪ 칸 지정. 헤더 "→ 이름들"·세부 정보·전날 20시 푸시 모두 이 합집합 기준. 둘 다 비면 지점 스탭 전원.

## 교육 탭 (`/garden/teaching`)
- 역할은 `finance.profiles.role` → `profile_roles.key`. 대표(OWNER)·finance admin 은 항상 관리 화면.
- 구글 팀 계정이 처음 열면 이름·지점 등록(스탭). 매니저로 올리려면 설정 › 간편 계정에서 역할 변경.
- 주제 목록은 `lib/teaching/topics.ts` 상수 — key 는 저장 키라 바꾸지 말고, 뺄 땐 `retired: true`.
- '받음' 판정: 위시 `requested_at` 이후에 참석한 교육 기록(`teaching_sessions` + attendees)이 있으면 받음. 재요청은 `requested_at` 갱신.
- 출근 전날 알림: 크론 `/api/cron/teaching-reminder` 매일 11:00 UTC(20:00 KST). 해당 지점 스탭 + 매니저 본인에게 웹 푸시(이메일 없음). 스탭은 교육 탭에서 '이 기기에서 알림 켜기'를 한 번 눌러야 받는다.
- 테이블은 전부 `finance.*`, RLS 켜고 정책 없음 — API(service role)만 접근. 권한 판정은 `lib/teaching/access.ts`.
