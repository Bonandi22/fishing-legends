#!/usr/bin/env bash
# Nightly Postgres backup: pg_dump, restore into a scratch db on the same
# server to prove the dump is valid, record a per-table row-count manifest
# from that restore, then prune dumps older than BACKUP_RETENTION_DAYS.
#
# Reads connection info from the standard libpq env vars (PGHOST, PGPORT,
# PGUSER, PGPASSWORD, PGDATABASE) so pg_dump/pg_restore/psql/createdb/dropdb
# all pick it up with no explicit flags.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$BACKUP_DIR"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_manifest() {
  local db="$1" manifest_path="$2" first=1 name count
  {
    printf '{'
    while IFS='|' read -r name count; do
      [ -z "$name" ] && continue
      if [ "$first" -eq 1 ]; then first=0; else printf ','; fi
      printf '"%s":%s' "$(json_escape "$name")" "$count"
    done < <(psql -X -q -A -t -F'|' -d "$db" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/manifest_query.sql")
    printf '}\n'
  } > "$manifest_path"
}

cleanup_stray_verify_dbs() {
  psql -X -q -A -t -c "SELECT datname FROM pg_database WHERE datname LIKE '_backup_verify_%';" \
    | while read -r d; do
        [ -z "$d" ] && continue
        echo "[backup] dropping stray scratch db $d (left over from a failed run)"
        dropdb --if-exists "$d"
      done
}

run_backup() {
  local ts dump_path manifest_path verify_db
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  dump_path="$BACKUP_DIR/$ts.dump"
  manifest_path="$BACKUP_DIR/$ts.manifest.json"
  verify_db="_backup_verify_${ts}"

  echo "[backup] dumping ${PGDATABASE:-} -> $dump_path"
  pg_dump --format=custom --file="$dump_path"

  echo "[backup] verifying restore into scratch db $verify_db"
  createdb "$verify_db"
  pg_restore --dbname="$verify_db" --no-owner --no-privileges "$dump_path"
  write_manifest "$verify_db" "$manifest_path"
  dropdb "$verify_db"

  echo "[backup] manifest written -> $manifest_path"
}

prune_old_backups() {
  local newest keep_ts f f_ts
  newest="$(ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | head -n1 || true)"
  [ -z "$newest" ] && return 0
  keep_ts="$(basename "$newest" .dump)"

  find "$BACKUP_DIR" -maxdepth 1 -name '*.dump' -mtime "+$RETENTION_DAYS" -print | while read -r f; do
    f_ts="$(basename "$f" .dump)"
    [ "$f_ts" = "$keep_ts" ] && continue
    echo "[backup] pruning $f_ts (older than ${RETENTION_DAYS}d)"
    rm -f "$BACKUP_DIR/$f_ts.dump" "$BACKUP_DIR/$f_ts.manifest.json"
  done
}

if [ "${RUN_ONCE:-false}" = "true" ]; then
  cleanup_stray_verify_dbs
  run_backup
  prune_old_backups
  exit 0
fi

while true; do
  cleanup_stray_verify_dbs
  run_backup
  prune_old_backups
  echo "[backup] sleeping ${INTERVAL_SECONDS}s"
  sleep "$INTERVAL_SECONDS"
done
