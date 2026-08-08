# Supabase 스키마 관리

**2026-08-08 부터 CLI 마이그레이션 체계로 전환.** 현재 프로덕션 스키마 전체(public + finance,
RLS 정책·그랜트 포함)가 `migrations/20260808181841_remote_schema_baseline.sql` 베이스라인으로
잡혀 있고, 원격 이력(`supabase_migrations.schema_migrations`)에도 적용됨으로 기록돼 있다.
루트의 `migration_*.sql` 들은 전환 이전의 수동 실행 기록 — **이미 전부 베이스라인에 포함**되어
있으므로 다시 실행하지 않는다(역사 참고용으로만 유지).

## 새 변경을 만들 때 (전환 후 워크플로)

```bash
cd ~/Projects/team-at
supabase migration new <이름>          # supabase/migrations/<ts>_<이름>.sql 생성 → SQL 작성
supabase db push --db-url "$SUPABASE_DB_URL"   # 미적용분만 순서대로 적용
supabase migration list --db-url "$SUPABASE_DB_URL"   # 이력 확인
```

- `SUPABASE_DB_URL` 은 `.env.local` 에 있다(세션 풀러 경유, 비밀번호 포함).
- 여전히 멱등하게 작성하는 습관은 유지 — 코드 쪽 권한 판정과 RLS 를 함께 고칠 것.
- 주의(환경 제약, 2026-08-08 기준):
  - `supabase link` 는 CLI 2.112.0 의 api-keys 응답 파싱 버그로 실패 — `supabase/.temp/project-ref`
    수동 기록으로 우회해 뒀다. 새 CLI 버전에서 link 가 되면 `--db-url` 없이도 동작한다.
  - `db pull`/`db diff` 는 shadow DB용 Docker 가 필요한데 이 Mac 엔 Docker 가 없다.
    스키마 재덤프가 필요하면 `/opt/homebrew/opt/libpq/bin/pg_dump --schema-only --no-owner
    --schema=public --schema=finance` 로 뜬다(이번 베이스라인 생성 방식).
  - 직결 호스트(db.*.supabase.co)는 IPv6 전용이라 항상 풀러 주소를 쓴다.

---

## (전환 이전 기록) 수동 실행 방식

이 폴더의 SQL은 **Supabase SQL Editor에 수동으로 붙여넣어 실행**하는 방식으로 운영해 왔다.
모든 파일은 멱등(여러 번 실행해도 안전)하게 작성하는 것이 규칙이다 — `create table if not exists`,
`create or replace view`, `drop policy if exists` 후 재생성.

## 실행 순서 (git 도입 이력 기준)

새 환경을 만들거나 미적용분을 확인할 때 이 순서대로 실행한다. 표기 날짜는 최초 커밋일.

| 순서 | 파일 | 도입일 |
|---|---|---|
| 1 | `schema.sql` (+ `seed.sql`) | 07-03 |
| 2 | `migration_monthly_close.sql` | 07-04 |
| 3 | `migration_card_statement.sql` · `migration_pos_pnl.sql` · `migration_receipt.sql` · `migration_vat_taxable.sql` · `migration_viewer_dashboard.sql` | 07-05 |
| 4 | `migration_notify_prefs.sql` · `migration_notify_recipients.sql` · `migration_push.sql` · `migration_transfer.sql` | 07-07 |
| 5 | `migration_activity_log.sql` · `migration_channel_fees.sql` · `migration_dashboard_pos.sql` · `migration_vendor_delete.sql` | 07-08 |
| 6 | `migration_naverpay.sql` | 07-10 |
| 7 | `migration_notify_topics.sql` | 07-13 |
| 8 | `migration_transfer_brand.sql` | 07-16 |
| 9 | `migration_brand.sql` · `migration_excel_source.sql` · `migration_upload_slots.sql` | 07-17 |
| 10 | `migration_coupang.sql` · `migration_member_brand_scope.sql` · `migration_scope_rules_uploads.sql` | 07-22 |
| 11 | `migration_accounting_split.sql` | 07-28 |
| 12 | `migration_personal_brand.sql` · `migration_personal_expense_category.sql` · `migration_store_close.sql` | 07-31 |
| 13 | `migration_brand_settings.sql` | 08-01 |
| 14 | `migration_excel_bank_identity.sql` | 08-02 |
| 15 | `migration_garden_words.sql` | 08-03 |
| 16 | `migration_place_reviews.sql` | 08-06 |
| 17 | `migration_garden_tab_access.sql` · `migration_members_policies.sql` · `migration_page_access.sql` | 08-07 |

같은 날짜 안에서는 파일 간 의존이 없도록 작성돼 있어 순서 무관.
단, 뷰를 재정의하는 파일(`migration_brand.sql` → `migration_member_brand_scope.sql` → `migration_accounting_split.sql`)은
나중 파일이 이전 뷰 정의를 덮어쓰므로 **반드시 도입 순서대로** 실행한다.

## 왜 이 문서가 필요한가 (드리프트 리스크)

- 마이그레이션 적용 이력이 DB 어디에도 기록되지 않는다 — "어디까지 실행했더라"를 사람이 기억해야 한다.
- 그래서 앱 6곳(`finance/transfer`, `pos/apply`, `excel/save`, `excel/status` 등)이 런타임에 스키마 부재를
  감지해 "관리자가 migration_xxx.sql 을 실행해야 해요"라고 안내하는 폴백을 두고 있다.
- 코드 쪽 권한 판정과 RLS 정책을 **동일하게 유지하라**는 주석이 여러 파일에 있다 — SQL 만 고치고
  코드를 안 고치면(또는 반대) 권한이 어긋난다.

## Supabase CLI 도입 절차 (전환 시)

수동 실행을 CLI 마이그레이션 이력 관리로 전환하려면 (한 번만, 대화형 로그인 필요):

```bash
brew install supabase/tap/supabase
cd ~/Projects/team-at
supabase login                 # 브라우저 인증
supabase init                  # supabase/config.toml 생성
supabase link --project-ref <ref>   # ref 는 NEXT_PUBLIC_SUPABASE_URL 의 서브도메인
supabase db pull               # 현재 프로덕션 스키마를 베이스라인 마이그레이션으로 생성
```

이후 새 변경은 `supabase migration new <이름>` 으로 파일을 만들고 `supabase db push` 로 적용한다.
기존 `migration_*.sql` 은 이미 적용된 이력이므로 옮기지 않는다(베이스라인에 포함됨).
전환 전까지는 위 실행 순서 표를 유지·갱신한다 — **새 마이그레이션을 추가하면 이 표에도 한 줄 추가할 것.**
