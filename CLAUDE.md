# team-at — 세션 공통 작업 규칙

여러 Claude Code 세션이 **같은 클론에서 동시에** 작업하는 리포다. 아래 규칙은 실제 사고에서 나왔다 — 예외 없이 지킬 것.

## Git / 배포
- **`git add -A` · `git add .` 금지.** 내가 만든/고친 파일만 경로를 명시해 add 한다 (2026-08-07 다른 세션 WIP 쓸림 사고).
- **배포는 `git push origin main` 으로만.** GitHub 연동 자동 배포가 커밋 기준으로 빌드한다 (2026-08-08 확인).
  - `vercel deploy --prod` 수동 배포 금지 — 워킹트리째 올라가 다른 세션의 미커밋 변경이 함께 배포된다.
  - 배포 감시: `npx vercel api "/v6/deployments?limit=5"` 에서 `meta.githubCommitSha` 로 내 커밋을 찾아 state 확인. (`vercel ls` 는 이스케이프 때문에 grep 파싱이 깨지고, 앨리어스 inspect 는 이전 배포를 보여준다.)
- main 은 항상 배포 가능한 상태로 커밋한다 — push 가 곧 프로덕션이다.

## 테스트 / 빌드
- `npm test` = vitest (`tests/`). **`npm run build` 가 테스트를 먼저 돌린다** — 테스트가 깨지면 Vercel 배포도 중단된다.
- 파서(토스/페이히어)·정규화·dedup 규칙을 고치면 반드시 해당 테스트를 함께 갱신 — 이 규칙들이 틀어지면 회계 금액이 조용히 틀어진다.

## DB 스키마 (Supabase)
- **SQL Editor 수동 실행 금지.** 변경은 `supabase migration new <이름>` → `supabase db push --db-url "$SUPABASE_DB_URL"` (URL 은 `.env.local`). 워크플로·환경 제약은 `supabase/README.md` 가 정본.
- 루트의 `migration_*.sql` 은 CLI 전환(2026-08-08) 이전 기록 — 재실행하지 않는다.
- RLS 정책과 코드 쪽 권한 판정은 **항상 같이** 고친다 (`lib/finance/access.ts` 주석 참조).

## 접근 통제
- 단일 관문은 `middleware.ts` — 새 페이지는 섹션(`lib/access/sections.ts`), 가든 하위 페이지는 탭 레지스트리(`lib/garden/tabs.ts`)에 등록해야 권한 체계에 들어온다.
- 새 API 는 `sectionsForApiPath()` 매핑을 검토하고, 세션 없이 호출되는 라우트만 `PUBLIC_API` 에 추가(자체 토큰 인증 필수).
- 판정 로직을 바꾸면 `tests/access-control.test.ts` 를 함께 갱신.

## 운영 문서
- 수집기 토큰 회전: `docs/ops-tokens.md`
- 무인 수집기(쿠팡·네이버페이·리뷰)는 로컬 Mac launchd — 상태는 회계 홈(/dashboard) 카드, 지연/실패는 매일 10시 크론이 알림.
