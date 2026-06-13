#!/usr/bin/env bash
#
# sync.sh — mirror the Home Assistant Life360 history DB to a local read-only copy.
#
# The HA box logs family GPS every 15 min into /share/life360/life360_history.db
# (reachable via the `hass` ssh alias). This pulls that file to ./data/locations.db
# so the Next.js app can read it locally without touching the live DB.
#
# Usage:
#   scripts/sync.sh           # one-shot sync
#   scripts/sync.sh --watch   # re-sync every $SYNC_INTERVAL seconds (default 600)
#
# Strategy: try scp (fast, whole-file). If the SSH add-on blocks scp/sftp, fall
# back to streaming a .dump over ssh and rebuilding the DB locally.

set -euo pipefail

SSH_HOST="${SSH_HOST:-hass}"
REMOTE_DB="${REMOTE_DB:-/share/life360/life360_history.db}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/../data}"
LOCAL_DB="$DATA_DIR/locations.db"
SYNC_INTERVAL="${SYNC_INTERVAL:-600}"

mkdir -p "$DATA_DIR"

sync_once() {
  local tmp="$LOCAL_DB.tmp.$$"

  if scp -q "$SSH_HOST:$REMOTE_DB" "$tmp" 2>/dev/null; then
    mv -f "$tmp" "$LOCAL_DB"
    echo "[sync] scp ok -> $LOCAL_DB"
  else
    echo "[sync] scp failed, falling back to ssh .dump" >&2
    rm -f "$tmp"
    # Stream a SQL dump and rebuild locally. Quoted heredoc avoids the
    # single-quote nesting trap documented for this DB.
    ssh "$SSH_HOST" "sqlite3 '$REMOTE_DB' .dump" > "$tmp.sql"
    rm -f "$tmp"
    sqlite3 "$tmp" < "$tmp.sql"
    rm -f "$tmp.sql"
    mv -f "$tmp" "$LOCAL_DB"
    echo "[sync] dump rebuild ok -> $LOCAL_DB"
  fi

  # Quick sanity line (row count). Non-fatal if sqlite3 isn't installed locally.
  if command -v sqlite3 >/dev/null 2>&1; then
    local n
    n="$(sqlite3 "$LOCAL_DB" 'SELECT count(*) FROM location;' 2>/dev/null || echo '?')"
    echo "[sync] location rows: $n"
  fi
}

if [[ "${1:-}" == "--watch" ]]; then
  echo "[sync] watch mode, every ${SYNC_INTERVAL}s (ctrl-c to stop)"
  while true; do
    sync_once || echo "[sync] error, will retry next interval" >&2
    sleep "$SYNC_INTERVAL"
  done
else
  sync_once
fi
