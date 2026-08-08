#!/bin/sh
# team-at Supabase 주간 백업 — launchd(com.ourhour.teamat-db-backup)가 매주 일요일 21시에 실행.
# 회계 원장이 든 DB 라 Supabase 자동 백업(7일)만으로는 부족 — 로컬에 8주치 이중 보관한다.
# public + finance 스키마 전체(데이터 포함). auth 스키마(로그인 계정)는 Supabase 관리 영역이라 제외.
# 접속 문자열은 .env.local 의 SUPABASE_DB_URL (supabase/README.md 참조).

set -u
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
  # 8주치만 보관 — 오래된 것부터 정리
  ls -t "$OUT_DIR"/teamat-*.sql.gz 2>/dev/null | tail -n +9 | xargs rm -f 2>/dev/null
  echo "$(date '+%Y-%m-%d %H:%M:%S') OK teamat-$STAMP.sql.gz ($(du -h "$FILE.gz" | cut -f1))" >> "$OUT_DIR/backup.log"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') FAIL" >> "$OUT_DIR/backup.log"
  osascript -e 'display notification "pg_dump 실패 — ~/Backups/team-at-db/backup.log 확인" with title "❌ team-at DB 백업" sound name "Basso"'
  exit 1
fi
