#!/bin/zsh
# team-at 인프라 헬스체크 — launchd 가 매일 09:00 실행 (com.ourhour.teamat-infra-health).
#
# 배경(2026-08-20): Vercel Blob 스토어가 무료 티어 한도 초과로 정지(suspended)돼
# 원본 자료함·업무 보드·발주 큐가 전부 403 이 났는데, 아무도 며칠간 모르고 있었다.
# 앱이 스스로 알리는 방식은 알림 채널(카톡 큐)마저 Blob 경유라 같이 죽는다 —
# 그래서 앱 밖(이 Mac)에서 독립적으로 점검하고 macOS 알림으로 알린다.
#
# 점검 항목:
#   1. Vercel Blob 읽기/쓰기 (이번 사고 유형)
#   2. Supabase DB 연결 (재무 데이터 전체)
#   3. team-at 프로덕션 페이지 응답
#   4. 수집기 최근 성공 시각 (naverpay-export / coupang-export 의 last-success)
# 실패 시: macOS 알림센터 배너(놓치면 안 되므로 개별 항목마다) + 리포트 파일.
set -u
ROOT="/Users/thomasparks/Projects/team-at"
cd "$ROOT"

# 절전 중 실행 방지 — DarkWake(2초) 안에서 죽으면 점검을 못 한다(naverpay healthcheck.sh 와 동일 처방)
if [[ "${TA_CAFFEINATED:-}" != "1" ]]; then
  export TA_CAFFEINATED=1
  exec /usr/bin/caffeinate -is "$ROOT/scripts/infra-healthcheck.sh" "$@"
fi
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/Users/thomasparks/.local/bin:/usr/local/bin:/usr/bin:/bin"

OUT="$ROOT/scripts/out"
mkdir -p "$OUT"
REPORT="$OUT/infra-health-report.txt"
HEARTBEAT="$OUT/infra-health-last-run.txt"
FAILS=0
: > "$REPORT"

notify() { # $1=제목 $2=내용
  /usr/bin/osascript -e "display notification \"$2\" with title \"$1\" sound name \"Glass\"" || true
}
log() { echo "$(date +%H:%M:%S) $1" | tee -a "$REPORT"; }
fail() { # $1=항목 $2=상세
  FAILS=$((FAILS + 1))
  log "❌ $1 — $2"
  notify "❌ team-at 인프라: $1" "$2"
}

# ── 1. Vercel Blob 읽기/쓰기 ─────────────────────────────────────────
# 1바이트를 쓰고 지운다. 정지(suspended)면 403 'store has been suspended' 가 난다.
BLOB_RESULT=$(node -e "
const { put, del } = require('@vercel/blob');
const fs = require('fs');
const env = fs.readFileSync('$ROOT/.env.local', 'utf8');
const token = env.match(/BLOB_READ_WRITE_TOKEN=(\S+)/)?.[1];
(async () => {
  // allowOverwrite — 이전 실행의 del 이 실패해 프로브 파일이 남으면 'already exists' 오탐이 났다(2026-08-22)
  const r = await put('health/__probe__.txt', 'x', { access: 'private', token, addRandomSuffix: false, allowOverwrite: true });
  const res = await fetch(r.url, { headers: { authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('읽기 ' + res.status);
  await del(r.url, { token });
  console.log('OK');
})().catch(e => { console.log('FAIL ' + e.message.slice(0, 120)); });
" 2>&1 | tail -1)
if [[ "$BLOB_RESULT" == "OK" ]]; then
  log "✅ Blob 읽기/쓰기 정상"
else
  fail "Blob 스토어" "읽기/쓰기 실패: ${BLOB_RESULT} — Vercel 대시보드 Storage 확인 필요"
fi

# ── 2. Supabase DB ───────────────────────────────────────────────────
DB_URL=$(grep '^SUPABASE_DB_URL=' "$ROOT/.env.local" | cut -d= -f2-)
DB_RESULT=$(psql "$DB_URL" -tAc "select 'OK'" 2>&1 | tail -1)
if [[ "$DB_RESULT" == "OK" ]]; then
  log "✅ Supabase DB 연결 정상"
else
  fail "Supabase DB" "연결 실패: $(echo "$DB_RESULT" | head -c 120)"
fi

# ── 3. 프로덕션 페이지 ───────────────────────────────────────────────
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 20 https://team-at-apps.vercel.app/ || echo "000")
if [[ "$HTTP_CODE" =~ ^(200|307|308)$ ]]; then
  log "✅ 프로덕션 응답 정상 ($HTTP_CODE)"
else
  fail "프로덕션 페이지" "team-at-apps.vercel.app 응답 $HTTP_CODE"
fi

# ── 4. 수집기 최근 성공 (26시간 이내 = 정상) ─────────────────────────
check_collector() { # $1=이름 $2=last-success 경로
  local name="$1" f="$2"
  if [[ ! -f "$f" ]]; then
    fail "$name 수집기" "성공 기록 파일이 없어요($f)"
    return
  fi
  local last_epoch age_h
  last_epoch=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "$(cut -c1-19 "$f")" +%s 2>/dev/null || echo 0)
  age_h=$(( ($(date +%s) - last_epoch) / 3600 ))
  if (( age_h < 26 )); then
    log "✅ $name 수집기 정상 (${age_h}시간 전 성공)"
  else
    fail "$name 수집기" "마지막 성공이 ${age_h}시간 전 — 수집이 멈춰 있어요"
  fi
}
check_collector "네이버페이" "/Users/thomasparks/Projects/naverpay-export/out/last-success.txt"
check_collector "쿠팡" "/Users/thomasparks/Projects/coupang-export/out/last-success.txt"

# ── 5. DB 백업 신선도 (매일 21시 백업 — 50시간 이내 = 정상) ──────────
# 2026-08-22 감사 D8: 백업이 8주 연속 실패해도 로그 파일에만 남고 아무도 몰랐다 — 여기서 감시.
BK_DIR="/Users/thomasparks/Backups/team-at-db"
BK_LATEST=$(ls -t "$BK_DIR"/teamat-*.sql.gz 2>/dev/null | head -1)
if [[ -z "$BK_LATEST" ]]; then
  fail "DB 백업" "백업 파일이 하나도 없어요($BK_DIR)"
else
  BK_AGE_H=$(( ($(date +%s) - $(stat -f %m "$BK_LATEST")) / 3600 ))
  if (( BK_AGE_H < 50 )); then
    log "✅ DB 백업 정상 (${BK_AGE_H}시간 전 — $(basename "$BK_LATEST"))"
  else
    fail "DB 백업" "마지막 백업이 ${BK_AGE_H}시간 전 — backup-db.sh 가 멈춰 있어요(~/Backups/team-at-db/backup.log 확인)"
  fi
fi

# ── 심박 + 요약 ──────────────────────────────────────────────────────
echo "$(date -u +%FT%TZ) 점검 완료 — 실패 ${FAILS}건" | tee "$HEARTBEAT" >> "$REPORT"
if (( FAILS == 0 )); then
  # 정상일 땐 배너 없이 조용히 — 매일 뜨는 정상 알림은 곧 무시되기 때문
  exit 0
fi
exit 1
