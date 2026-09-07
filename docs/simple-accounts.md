# 간편 계정 · 매니저 교육 — 운영 메모 (2026-09-07)

## 간편 계정 (이름 + 숫자 6자리)
- 발급: `/settings` › 간편 계정. 이름·역할(스탭/매니저)·지점. 발급 직후 뜨는 6자리는 **그 자리에서 본인에게 전달** — 저장하지 않는다.
- 첫 로그인은 `/account/pin` 으로 보내져 본인이 새 6자리를 정한다. 잊으면 설정에서 **비밀번호 초기화**(새 6자리 발급).
- 로그인 화면(`/`)의 구글 버튼 아래 폼 → `POST /api/simple-login`(PUBLIC_API). 5회 연속 실패 → 10분 잠금(`profiles.locked_until`).
- 내부 구조: Supabase 이메일/비밀번호 계정. 이메일은 `acct-<랜덤>@team-at.space`(팀 도메인이라 미들웨어 허용 통과, 구글 로그인 불가).
  저장 비밀번호 = `sha256(SIMPLE_LOGIN_PEPPER : 이메일 : PIN)` — **`SIMPLE_LOGIN_PEPPER` env 를 바꾸면 모든 간편 계정이 로그인 불가**(전원 초기화 필요). Vercel production 과 `.env.local` 에 동일 값.
- 발급 기본 권한: 가든 섹션 + 교육 탭(`garden_tab_access`). 넓히려면 페이지 접근 권한에서 토글.
- 삭제: 설정 › 간편 계정 › 삭제 — auth 계정과 프로필·요청·일정·기록이 함께 지워진다.

## 교육 탭 (`/garden/teaching`)
- 역할은 `finance.profiles.role`(staff/manager). 대표(OWNER)·finance admin 은 항상 관리 화면.
- 구글 팀 계정이 처음 열면 이름·지점 등록(스탭). 매니저로 올리려면 설정 › 간편 계정에서 역할 변경.
- 주제 목록은 `lib/teaching/topics.ts` 상수 — key 는 저장 키라 바꾸지 말고, 뺄 땐 `retired: true`.
- '받음' 판정: 위시 `requested_at` 이후에 참석한 교육 기록(`teaching_sessions` + attendees)이 있으면 받음. 재요청은 `requested_at` 갱신.
- 출근 전날 알림: 크론 `/api/cron/teaching-reminder` 매일 11:00 UTC(20:00 KST). 해당 지점 스탭 + 매니저 본인에게 웹 푸시(이메일 없음). 스탭은 교육 탭에서 '이 기기에서 알림 켜기'를 한 번 눌러야 받는다.
- 테이블은 전부 `finance.*`, RLS 켜고 정책 없음 — API(service role)만 접근. 권한 판정은 `lib/teaching/access.ts`.
