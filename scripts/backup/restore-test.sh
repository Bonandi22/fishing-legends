#!/usr/bin/env bash
# Proves a backup is restorable on a completely independent Postgres instance
# (not the server that produced it): restores the newest dump in a volume
# into a disposable container and diffs its row counts against the manifest
# backup.sh recorded at backup time.
set -euo pipefail

BACKUP_VOLUME="${BACKUP_VOLUME:-deep_blue_lure_prod_pg_backups}"
IMAGE="postgres:16-alpine"
CONTAINER_NAME="dbl-restore-test-$$"
SCRATCH_PASSWORD="restore-test-$$"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[restore-test] starting scratch postgres ($CONTAINER_NAME) from volume $BACKUP_VOLUME"
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$SCRATCH_PASSWORD" \
  -e POSTGRES_DB=restore_test \
  -v "$BACKUP_VOLUME":/backups:ro \
  -v "$SCRIPT_DIR/manifest_query.sql":/manifest_query.sql:ro \
  "$IMAGE" >/dev/null

echo "[restore-test] waiting for scratch postgres to accept connections"
ready=0
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "[restore-test] FAIL: scratch postgres never became ready" >&2
  exit 1
fi

dump_file="$(docker exec "$CONTAINER_NAME" sh -c 'ls -1 /backups/*.dump 2>/dev/null | sort | tail -n1')"
if [ -z "$dump_file" ]; then
  echo "[restore-test] FAIL: no *.dump files found in volume $BACKUP_VOLUME" >&2
  exit 1
fi
ts="$(basename "$dump_file" .dump)"
manifest_file="/backups/$ts.manifest.json"
echo "[restore-test] testing $ts"

if ! docker exec "$CONTAINER_NAME" test -f "$manifest_file"; then
  echo "[restore-test] FAIL: manifest $manifest_file not found for $dump_file" >&2
  exit 1
fi

echo "[restore-test] restoring $dump_file into restore_test"
docker exec -e PGPASSWORD="$SCRATCH_PASSWORD" "$CONTAINER_NAME" \
  pg_restore -U postgres --dbname=restore_test --no-owner --no-privileges "$dump_file"

echo "[restore-test] comparing row counts against manifest"
actual="$(docker exec -e PGPASSWORD="$SCRATCH_PASSWORD" "$CONTAINER_NAME" \
  sh -c 'psql -U postgres -X -q -A -t -F"|" -d restore_test -v ON_ERROR_STOP=1 -f /manifest_query.sql')"
expected_json="$(docker exec "$CONTAINER_NAME" cat "$manifest_file")"

fail=0
while IFS='|' read -r name count; do
  [ -z "$name" ] && continue
  expected_count="$(printf '%s' "$expected_json" | sed -n "s/.*\"$name\":\([0-9]*\).*/\1/p")"
  if [ -z "$expected_count" ]; then
    echo "[restore-test] FAIL: table '$name' present after restore but missing from manifest"
    fail=1
  elif [ "$expected_count" != "$count" ]; then
    echo "[restore-test] FAIL: table '$name' expected $expected_count rows, restored $count"
    fail=1
  else
    echo "[restore-test] OK: table '$name' = $count rows"
  fi
done <<< "$actual"

if [ "$fail" -eq 0 ]; then
  echo "[restore-test] PASS: $ts restored and verified"
else
  echo "[restore-test] FAIL: $ts did not verify cleanly" >&2
  exit 1
fi
