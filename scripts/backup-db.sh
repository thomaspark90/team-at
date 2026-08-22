#!/bin/sh
# team-at Supabase 백업 — launchd(com.ourhour.teamat-db-backup)가 **매일** 21시에 실행.
# 회계 원장이 든 DB 라 Supabase 자동 백업(7일)만으로는 부족 — 로컬에 30일치 이중 보관한다.
# (2026-08-22 감사 D8: 주 1회는 결산 주간 작업분이 최대 7일 무방비였다 — 매일로 상향,
#  같은 날 재실행은 같은 파일명으로 덮어써 하루 1벌 유지. 신선도는 infra-healthcheck 가 감시.)
# public + finance 스키마 전체(데이터 포함). auth 스키마(로그인 계정)는 Supabase 관리 영역이라 제외.
# 접속 문자열은 .env.local 의 SUPABASE_DB_URL (supabase/README.md 참조).

set -u

# 절전 중 실행 방지 — DarkWake(2초) 안에서 죽으면 pg_dump 가 조용히 끊긴다(infra-healthcheck 와 동일 처방)
if [ "${TA_CAFFEINATED:-}" != "1" ]; then
  export TA_CAFFEINATED=1
  exec /usr/bin/caffeinate -is /bin/sh "$0" "$@"
fi

cd "$(dirname "$0")/.." || exit 1

URL=$(grep '^SUPABASE_DB_URL=' .env.local | cut -d= -f2-)
if [ -z "$URL" ]; then
  osascript -e 'display notification ".env.local 에 SUPABASE_DB_URL 이 없어요" with title "❌ team-at DB 백업" sound name "Basso"'
  exit 1
fi

OUT_DIR="$HOME/Backups/team-at-db"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d)
FILE="$OUT_DIR/teamat-$STAMP.sql"

if /opt/homebrew/opt/libpq/bin/pg_dump "$URL" --no-owner --schema=public --schema=finance -f "$FILE" 2>> "$OUT_DIR/backup.log"; then
  gzip -f "$FILE"
  # 30일치 보관 — 오래된 것부터 정리(일 1벌 × ~700KB ≈ 월 20MB 수준)
  ls -t "$OUT_DIR"/teamat-*.sql.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null
  echo "$(date '+%Y-%m-%d %H:%M:%S') OK teamat-$STAMP.sql.gz ($(du -h "$FILE.gz" | cut -f1))" >> "$OUT_DIR/backup.log"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') FAIL" >> "$OUT_DIR/backup.log"
  osascript -e 'display notification "pg_dump 실패 — ~/Backups/team-at-db/backup.log 확인" with title "❌ team-at DB 백업" sound name "Basso"'
  exit 1
fi
