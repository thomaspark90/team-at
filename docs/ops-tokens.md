# 수집기 토큰 운영 절차

무인 수집기(로컬 Mac ↔ team-at API)는 파이프라인별 전용 비밀 토큰으로 인증한다.
세 토큰은 서로 다른 값이어야 한다 — 하나가 유출돼도 나머지 파이프라인은 안전하게.

| 파이프라인 | Vercel env | 헤더 | 로컬 수집기 (.env) |
|---|---|---|---|
| 쿠팡 주문 | `COUPANG_INGEST_TOKEN` | `x-coupang-token` | `~/Projects/coupang-export/.env` → `CP_INGEST_TOKEN` |
| 네이버페이 지출 | `NAVERPAY_INGEST_TOKEN` | `x-naverpay-token` | `~/Projects/naverpay-export/.env` |
| 네이버 리뷰 | `REVIEW_INGEST_TOKEN` | `x-review-token` | `~/Projects/naver-review-manager/.env` → `REVIEW_INGEST_TOKEN` |
| (크론 인증) | `CRON_SECRET` | `Authorization: Bearer` | 없음 — Vercel 크론 전용 |

2026-08-08 기준 쿠팡 토큰을 네이버페이 폴백에서 분리(전용 값)했다. 코드에 폴백은 더 이상 없다.

## 토큰 회전 절차 (파이프라인당 약 2분)

순서가 중요하다 — **서버(Vercel)에 새 값을 먼저 반영(배포)하고, 그 다음 로컬을 바꾼다.**
반대로 하면 다음 수집이 401 로 한 번 실패한다(치명적이진 않음 — 실패 알림이 오고 다음 실행이 따라잡는다).

```bash
# 1) 새 토큰 생성
openssl rand -hex 24

# 2) Vercel 에 교체 (기존 값 제거 후 추가)
cd ~/Projects/team-at
npx vercel env rm <ENV이름> production   # 확인 프롬프트 y
echo -n "<새값>" | npx vercel env add <ENV이름> production

# 3) 배포 (env 는 다음 배포부터 적용된다)
npx vercel deploy --prod   # push 자동 배포 전환 후에는 git push 로 대체

# 4) 로컬 수집기 .env 의 해당 변수를 새 값으로 교체 (위 표의 경로)

# 5) 다음 자동 실행을 기다리거나 수동 1회 실행해 정상 수신 확인
#    → 회계 홈(/dashboard) '자동 수집 상태' 카드가 '정상'인지 본다
```

## 유출 의심 시

즉시 2)~3)만 먼저 실행하면 유출된 토큰은 무효가 된다(수집은 로컬 갱신 전까지 잠시 실패).
ingest 라우트는 적재만 가능하고 조회는 불가라 데이터 유출 경로는 아니지만,
가짜 거래 주입이 가능하므로 회전 후 해당 기간 `uploads` 기록(분류 화면 → 업로드 이력)을 확인한다.
