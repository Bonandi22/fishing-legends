# Production Hardening (Backups + Forced HTTPS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave automated Postgres backups (with a restore-verification script) and forced HTTPS/HSTS (via certbot-managed TLS on the nginx-serving `frontend` container) fully built and validated in the repo, ready to turn on for a real VPS deployment.

**Architecture:** A new standalone `docker-compose.prod.yaml` adds four things on top of the existing `backend`/`frontend` Docker images (both already have a `runtime` target — no Dockerfile changes needed): a `postgres` service with production credentials, a `backup` service that dumps + locally restore-verifies + manifests + prunes on a loop, a `certbot` service that issues/renews a TLS certificate via the HTTP-01 webroot method, and the `frontend` service now serving over `443` (nginx config generated from a template via the official image's `envsubst` mechanism, restricted to substituting only `$DOMAIN`). Everything is validated against the existing local dev stack and disposable containers — nothing here touches a real domain or real production data.

**Tech Stack:** Docker Compose, `postgres:16-alpine` (server + client tools), `nginx:1.27-alpine` (official envsubst templating), `certbot/certbot`, bash (backup/restore/deploy scripts), plain SQL (manifest query).

**Spec:** `docs/superpowers/specs/2026-09-11-production-hardening-design.md`

## Global Constraints

- Target is a self-managed VPS running `docker compose` — no managed Postgres, no PaaS. Everything must be self-contained in this repo.
- **The project is not going to production yet.** Nothing in this plan runs against a real domain or real production data. Validation happens against the existing local dev stack (`docker compose up`, project name `deep-blue-lure`, network `deep-blue-lure_default`, Postgres credentials `deepbluelure`/`deepbluelure`/`deepbluelure`) and disposable throwaway containers only.
- `compose.yaml` and `docker/nginx.conf` (the dev-path files) are **never modified** by this plan. New behavior lives entirely in new files (`docker-compose.prod.yaml`, `docker/nginx.prod.conf.template`, `scripts/**`).
- Every new named Docker volume uses a fixed, explicit name (`name:` field, prefix `deep_blue_lure_prod_`) so host-side scripts (`restore-test.sh`, `init-letsencrypt.sh`) can reference them by name regardless of the compose project name used at `up` time.
- In production, only the `frontend` service publishes ports to the host (`80`, `443`). `postgres` and `backend` are reachable only over the compose-internal network — this is also what makes `TRUST_PROXY=true` safe (unlike the dev stack, which also publishes `postgres` on `5432` and would let a caller bypass the proxy).
- No secrets are committed. The real `.env.production` is git-ignored; only `.env.production.example` (placeholder values) is tracked.
- Off-site backup storage (S3-compatible upload) and wiring `restore-test.sh` into CI are explicitly out of scope — documented as deferred next steps, not built now.
- Every shell script is bash (`#!/usr/bin/env bash`, `set -euo pipefail`), not POSIX `sh` — the `postgres:16-alpine` and `alpine`-based containers used here don't ship bash by default, so any service that runs one installs it first via `apk add --no-cache bash` at container start (documented per-task below).

---

### Task 1: `.env.production.example` + gitignore allow-list

**Files:**
- Modify: `.gitignore` (allow-list line, next to the existing `.env.docker.example` one)
- Create: `.env.production.example`

**Interfaces:**
- Produces: every environment variable name later tasks read — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `DOMAIN`, `CERTBOT_EMAIL`, `BACKUP_RETENTION_DAYS`, `BACKUP_INTERVAL_SECONDS`, plus the existing backend vars (`TRUST_PROXY`, `COOKIE_SECURE`, `COOKIE_DOMAIN`, `CORS_ORIGINS`, etc.) with production-appropriate values.

- [ ] **Step 1: Confirm the file is currently gitignored (sanity check before editing)**

Run: `git check-ignore -v .env.production.example`
Expected: prints a match against the `.env.*` rule, e.g. `.gitignore:23:.env.*\t.env.production.example`, exit code 0.

- [ ] **Step 2: Add the allow-list entry to `.gitignore`**

Edit `.gitignore` — add a new line right after the existing `!.env.docker.example` line:

```
!.env.production.example
```

- [ ] **Step 3: Verify the file is no longer ignored**

Run: `git check-ignore -v .env.production.example`
Expected: no output, exit code 1 (not ignored).

- [ ] **Step 4: Write `.env.production.example`**

```
# Copy to .env.production (git-ignored) on the VPS before running:
#   docker compose -f docker-compose.prod.yaml --env-file .env.production up -d
# Every value below is a placeholder — replace ALL of them before first use.
# Never reuse the dev defaults from .env.docker.example (deepbluelure/deepbluelure).

NODE_ENV=production
LOG_LEVEL=info

# Backend HTTP (internal only — docker-compose.prod.yaml does not publish this
# port to the host; only the frontend/nginx container is internet-facing)
HOST=0.0.0.0
PORT=8090

# Postgres — pick real, unique credentials. These also drive DATABASE_URL below
# and the `backup` service's connection.
POSTGRES_USER=change-me
POSTGRES_PASSWORD=change-me-too
POSTGRES_DB=deepbluelure
DATABASE_URL=postgres://change-me:change-me-too@postgres:5432/deepbluelure

# Auth — generate with e.g. `openssl rand -base64 48`; must be >= 32 chars
ACCESS_TOKEN_SECRET=replace-with-a-real-random-secret-at-least-32-chars
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000

# Security
CORS_ORIGINS=https://your-domain.example
RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW_MS=60000
AUTH_RATE_LIMIT_MAX=20
AUTH_RATE_LIMIT_WINDOW_MS=300000
# Safe to set true here: docker-compose.prod.yaml never publishes the
# backend's port to the host, so nginx is the only way in and its
# X-Forwarded-For is trustworthy (unlike the dev stack, which also publishes
# 8090 directly and keeps this false).
TRUST_PROXY=true

# Cookies (auth)
COOKIE_SECURE=true
COOKIE_DOMAIN=your-domain.example

# TLS (docker-compose.prod.yaml: frontend + certbot services)
DOMAIN=your-domain.example
CERTBOT_EMAIL=you@your-domain.example

# Automated Postgres backups (docker-compose.prod.yaml: backup service)
BACKUP_RETENTION_DAYS=14
BACKUP_INTERVAL_SECONDS=86400
```

- [ ] **Step 5: Verify git sees it as a trackable, untracked file**

Run: `git status --porcelain .env.production.example`
Expected: `?? .env.production.example`

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.production.example
git commit -m "docs: add .env.production.example for the future production deploy"
```

---

### Task 2: `docker/nginx.prod.conf.template` (TLS + forced HTTPS)

**Files:**
- Create: `docker/nginx.prod.conf.template`

**Interfaces:**
- Consumes: env var `DOMAIN` (Task 1), substituted by the official nginx image's startup `envsubst` mechanism (restricted via `NGINX_ENVSUBST_FILTER=DOMAIN`, set later in Task 5's `frontend` service).
- Produces: `/etc/nginx/conf.d/default.conf` at container start (the image's `docker-entrypoint.d` scripts render any `/etc/nginx/templates/*.template` file into `/etc/nginx/conf.d/` automatically — this is a stock feature of `nginx:1.27-alpine`, no custom entrypoint needed).

- [ ] **Step 1: Generate a throwaway self-signed cert to prove the config is well-formed (before the file exists, so there is nothing valid to test against yet)**

Run:
```bash
mkdir -p /tmp/dbl-nginx-test/live/test.localhost
docker run --rm -v /tmp/dbl-nginx-test:/certs alpine sh -c "
  apk add --no-cache openssl >/dev/null &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /certs/live/test.localhost/privkey.pem \
    -out /certs/live/test.localhost/fullchain.pem \
    -subj '/CN=test.localhost'
"
```
Expected: two files created under `/tmp/dbl-nginx-test/live/test.localhost/`.

- [ ] **Step 2: Confirm there is nothing to validate yet (no template file)**

Run: `test -f docker/nginx.prod.conf.template && echo EXISTS || echo MISSING`
Expected: `MISSING`

- [ ] **Step 3: Write `docker/nginx.prod.conf.template`**

```nginx
# HTTP: serve the ACME challenge (cert issuance + renewal), redirect everything
# else to HTTPS. ${DOMAIN} is substituted by the nginx image's envsubst
# templating at container start (NGINX_ENVSUBST_FILTER=DOMAIN restricts it to
# just this one variable, leaving nginx's own $host/$scheme/etc. untouched).
server {
  listen 80;
  server_name ${DOMAIN};

  location /.well-known/acme-challenge/ {
    root /var/www/certbot;
  }

  location / {
    return 301 https://$host$request_uri;
  }
}

server {
  listen 443 ssl;
  http2 on;
  server_name ${DOMAIN};
  root /usr/share/nginx/html;
  index index.html;

  ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;

  # API is proxied same-origin so auth cookies are first-party to the SPA
  location /api/ {
    proxy_pass http://backend:8090;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # SPA: unknown paths fall back to index.html
  location / {
    try_files $uri $uri/ /index.html;

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'; worker-src 'self' blob:; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
  }

  # Hashed assets are safe to cache aggressively
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;
}
```

- [ ] **Step 4: Validate the rendered config parses (`nginx -t`)**

Run:
```bash
docker run --rm \
  -v "$(pwd)/docker/nginx.prod.conf.template":/etc/nginx/templates/default.conf.template:ro \
  -v /tmp/dbl-nginx-test:/etc/letsencrypt:ro \
  -e DOMAIN=test.localhost \
  -e NGINX_ENVSUBST_FILTER=DOMAIN \
  nginx:1.27-alpine \
  sh -c "/docker-entrypoint.sh nginx -t"
```
Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful` (the entrypoint script renders the template before `nginx -t` runs, since `/docker-entrypoint.sh` is the image's normal startup wrapper and template rendering is one of its `docker-entrypoint.d/` steps).

- [ ] **Step 5: Confirm `${DOMAIN}` was actually substituted, not left literal**

Run:
```bash
docker run --rm \
  -v "$(pwd)/docker/nginx.prod.conf.template":/etc/nginx/templates/default.conf.template:ro \
  -v /tmp/dbl-nginx-test:/etc/letsencrypt:ro \
  -e DOMAIN=test.localhost \
  -e NGINX_ENVSUBST_FILTER=DOMAIN \
  nginx:1.27-alpine \
  sh -c "/docker-entrypoint.sh nginx -t 2>&1; grep -c 'test.localhost' /etc/nginx/conf.d/default.conf; grep -c '\\$host' /etc/nginx/conf.d/default.conf"
```
Expected: the first `grep -c` prints `3` or more (server_name x2, ssl_certificate paths x2 — at least one per block), and the second `grep -c` prints a nonzero count too, proving nginx's own `$host` variable inside `location /` was **not** substituted away (still exists as a literal nginx var, not blanked out).

- [ ] **Step 6: Clean up the throwaway certs**

Run: `rm -rf /tmp/dbl-nginx-test`

- [ ] **Step 7: Commit**

```bash
git add docker/nginx.prod.conf.template
git commit -m "infra: add TLS-enabled nginx template for production"
```

---

### Task 3: `scripts/backup/manifest_query.sql` + `scripts/backup/backup.sh`

**Files:**
- Create: `scripts/backup/manifest_query.sql`
- Create: `scripts/backup/backup.sh`

**Interfaces:**
- Consumes: standard libpq env vars (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — read automatically by `pg_dump`/`pg_restore`/`psql`/`createdb`/`dropdb`, no explicit flags needed), plus `BACKUP_DIR` (default `/backups`), `BACKUP_RETENTION_DAYS` (default `14`), `BACKUP_INTERVAL_SECONDS` (default `86400`), `RUN_ONCE` (default `false` — set `true` for a single dump-and-exit run, used by this task's tests and available for a future cron/CI-triggered deployment style).
- Produces: for every run, a pair of files in `$BACKUP_DIR`: `<UTC timestamp>.dump` (pg_dump custom format) and `<UTC timestamp>.manifest.json` (`{"table_name": row_count, ...}` for every base table in the `public` schema, computed from a **local restore-verify** — the dump is immediately restored into a scratch database on the same server and counted there, so the manifest is guaranteed to match exactly what restoring that dump produces). Consumed by Task 4's `restore-test.sh`.
- Note (deviation from the spec's exact mechanism): the spec described a `pg_export_snapshot()`-based live snapshot shared between `pg_dump` and a separate counting connection. This plan instead restores the just-taken dump into a scratch db (`_backup_verify_<timestamp>`) on the same Postgres server and counts rows there. This achieves the same goal — a manifest that provably matches what the dump restores to — with a simpler, more robust mechanism (no cross-connection snapshot import/coprocess plumbing), and additionally self-verifies every single backup is restorable at backup time, not just when `restore-test.sh` happens to run.

- [ ] **Step 1: Write `scripts/backup/manifest_query.sql`**

```sql
SELECT
  table_name,
  (xpath('/row/c/text()',
    query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')
  ))[1]::text::bigint AS row_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

- [ ] **Step 2: Write `scripts/backup/backup.sh`**

```bash
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
  newest="$(ls -1 "$BACKUP_DIR"/*.dump 2>/dev/null | sort | tail -n1 || true)"
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
```

- [ ] **Step 3: Make it executable**

Run: `chmod +x scripts/backup/backup.sh`

- [ ] **Step 4: Run it once against the local dev stack's Postgres (RUN_ONCE mode)**

The dev stack must already be up (`docker compose up -d`, network `deep-blue-lure_default`, Postgres service `postgres`, db `deepbluelure`/`deepbluelure`/`deepbluelure` — this is read-only against real dev data, nothing destructive).

Run:
```bash
docker volume create dbl_backup_test >/dev/null
docker run --rm \
  --network deep-blue-lure_default \
  -e PGHOST=postgres -e PGPORT=5432 \
  -e PGUSER=deepbluelure -e PGPASSWORD=deepbluelure -e PGDATABASE=deepbluelure \
  -e RUN_ONCE=true \
  -v dbl_backup_test:/backups \
  -v "$(pwd)/scripts/backup":/scripts:ro \
  --entrypoint /bin/sh \
  postgres:16-alpine \
  -c "apk add --no-cache bash >/dev/null && bash /scripts/backup.sh"
```
Expected: output ends with `[backup] manifest written -> /backups/<timestamp>.manifest.json`, exit code 0.

- [ ] **Step 5: Inspect the produced files**

Run:
```bash
docker run --rm -v dbl_backup_test:/backups alpine sh -c "ls -la /backups && echo --- && cat /backups/*.manifest.json"
```
Expected: one `<ts>.dump` and one `<ts>.manifest.json`; the JSON is a single-line object containing at least `"users":` followed by a number (the dev `users` table), and no key has a missing or non-numeric value.

- [ ] **Step 6: Test pruning keeps the newest backup even past retention**

Run:
```bash
docker run --rm -v dbl_backup_test:/backups alpine sh -c "
  touch -d '30 days ago' /backups/fake-old-1.dump /backups/fake-old-1.manifest.json
  touch -d '30 days ago' /backups/fake-old-2.dump /backups/fake-old-2.manifest.json
"
docker run --rm \
  --network deep-blue-lure_default \
  -e PGHOST=postgres -e PGPORT=5432 \
  -e PGUSER=deepbluelure -e PGPASSWORD=deepbluelure -e PGDATABASE=deepbluelure \
  -e RUN_ONCE=true -e BACKUP_RETENTION_DAYS=14 \
  -v dbl_backup_test:/backups \
  -v "$(pwd)/scripts/backup":/scripts:ro \
  --entrypoint /bin/sh \
  postgres:16-alpine \
  -c "apk add --no-cache bash >/dev/null && bash /scripts/backup.sh"
docker run --rm -v dbl_backup_test:/backups alpine ls /backups
```
Expected: `fake-old-1.dump`/`fake-old-1.manifest.json` and `fake-old-2.dump`/`fake-old-2.manifest.json` are gone (pruned — older than 14 days and not the newest); the two new timestamped files from steps 4 and this step's own run remain (the step's own fresh dump is by definition the newest and is always kept).

- [ ] **Step 7: Clean up the test volume**

Run: `docker volume rm dbl_backup_test`

- [ ] **Step 8: Commit**

```bash
git add scripts/backup/manifest_query.sql scripts/backup/backup.sh
git commit -m "infra: add automated Postgres backup script with restore-verified manifests"
```

---

### Task 4: `scripts/backup/restore-test.sh`

**Files:**
- Create: `scripts/backup/restore-test.sh`

**Interfaces:**
- Consumes: `BACKUP_VOLUME` (default `deep_blue_lure_prod_pg_backups` — the fixed name Task 5's compose file declares), `scripts/backup/manifest_query.sql` (Task 3), the `<ts>.dump` / `<ts>.manifest.json` file pairs `backup.sh` produces (Task 3).
- Produces: exit code `0` and a `[restore-test] PASS: <ts> restored and verified` line on success; exit code `1` and one `[restore-test] FAIL: ...` line per mismatching/missing table otherwise. Intended for manual use now; a documented candidate for a future scheduled CI job (not wired up in this plan).

- [ ] **Step 1: Write `scripts/backup/restore-test.sh`**

```bash
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
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/backup/restore-test.sh`

- [ ] **Step 3: Positive test — run it against a real backup**

```bash
docker volume create dbl_restore_test >/dev/null
docker run --rm \
  --network deep-blue-lure_default \
  -e PGHOST=postgres -e PGPORT=5432 \
  -e PGUSER=deepbluelure -e PGPASSWORD=deepbluelure -e PGDATABASE=deepbluelure \
  -e RUN_ONCE=true \
  -v dbl_restore_test:/backups \
  -v "$(pwd)/scripts/backup":/scripts:ro \
  --entrypoint /bin/sh \
  postgres:16-alpine \
  -c "apk add --no-cache bash >/dev/null && bash /scripts/backup.sh"

BACKUP_VOLUME=dbl_restore_test ./scripts/backup/restore-test.sh
```
Expected: a line of `[restore-test] OK: table '<name>' = <n> rows` per table, ending with `[restore-test] PASS: <ts> restored and verified`, exit code 0.

- [ ] **Step 4: Negative test — corrupt the manifest and confirm it fails loudly**

```bash
docker run --rm -v dbl_restore_test:/backups alpine sh -c "
  f=\$(ls /backups/*.manifest.json | head -n1)
  sed -i 's/\"users\":[0-9]*/\"users\":999999/' \"\$f\"
"
BACKUP_VOLUME=dbl_restore_test ./scripts/backup/restore-test.sh; echo "exit code: $?"
```
Expected: a `[restore-test] FAIL: table 'users' expected 999999 rows, restored <real count>` line and `exit code: 1`.

- [ ] **Step 5: Clean up the test volume**

Run: `docker volume rm dbl_restore_test`

- [ ] **Step 6: Commit**

```bash
git add scripts/backup/restore-test.sh
git commit -m "infra: add restore-test script that verifies backups on a disposable Postgres"
```

---

### Task 5: `docker-compose.prod.yaml`

**Files:**
- Create: `docker-compose.prod.yaml`

**Interfaces:**
- Consumes: `.env.production.example`'s variable names (Task 1), `docker/nginx.prod.conf.template` (Task 2), `scripts/backup/backup.sh` (Task 3).
- Produces: fixed volume names `deep_blue_lure_prod_pgdata`, `deep_blue_lure_prod_pg_backups`, `deep_blue_lure_prod_letsencrypt`, `deep_blue_lure_prod_certbot_webroot` — consumed by Task 4's `restore-test.sh` (via `BACKUP_VOLUME`) and Task 6's `init-letsencrypt.sh`. Service names `postgres`, `backend`, `frontend`, `certbot`, `backup` — consumed by Task 6.

- [ ] **Step 1: Write `docker-compose.prod.yaml`**

```yaml
# Production stack. NOT used by `docker compose up` (that's compose.yaml, dev
# only) — run explicitly with:
#   docker compose -f docker-compose.prod.yaml --env-file .env.production up -d
# See docs/deploy/production.md for the full first-time setup (TLS bootstrap
# via scripts/deploy/init-letsencrypt.sh must run once before this works).

name: deep-blue-lure-prod

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
      target: runtime
    env_file:
      - .env.production
    environment:
      HOST: 0.0.0.0
      PORT: "8090"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    environment:
      DOMAIN: ${DOMAIN}
      NGINX_ENVSUBST_FILTER: DOMAIN
    volumes:
      - ./docker/nginx.prod.conf.template:/etc/nginx/templates/default.conf.template:ro
      - certbot_webroot:/var/www/certbot:ro
      - letsencrypt:/etc/letsencrypt:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    volumes:
      - certbot_webroot:/var/www/certbot
      - letsencrypt:/etc/letsencrypt
    entrypoint: ["sh", "-c"]
    command:
      - |
        trap exit TERM
        while :; do
          certbot renew --webroot -w /var/www/certbot --quiet
          sleep 12h & wait "$$!"
        done
    restart: unless-stopped

  backup:
    image: postgres:16-alpine
    environment:
      PGHOST: postgres
      PGPORT: "5432"
      PGUSER: ${POSTGRES_USER}
      PGPASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: ${POSTGRES_DB}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-14}
      BACKUP_INTERVAL_SECONDS: ${BACKUP_INTERVAL_SECONDS:-86400}
    volumes:
      - pg_backups:/backups
      - ./scripts/backup:/scripts:ro
    depends_on:
      postgres:
        condition: service_healthy
    entrypoint: ["/bin/sh", "-c"]
    command:
      - "apk add --no-cache bash >/dev/null && exec bash /scripts/backup.sh"
    restart: unless-stopped

volumes:
  pg_data:
    name: deep_blue_lure_prod_pgdata
  pg_backups:
    name: deep_blue_lure_prod_pg_backups
  letsencrypt:
    name: deep_blue_lure_prod_letsencrypt
  certbot_webroot:
    name: deep_blue_lure_prod_certbot_webroot
```

- [ ] **Step 2: Validate the compose file parses and every variable resolves**

Run: `docker compose -f docker-compose.prod.yaml --env-file .env.production.example config --quiet`
Expected: exit code 0, no output (`--quiet` suppresses the rendered YAML, printing only errors — none expected).

- [ ] **Step 3: Spot-check the rendered config for the settings that matter most**

Run: `docker compose -f docker-compose.prod.yaml --env-file .env.production.example config | grep -E "80:80|443:443|deep_blue_lure_prod|TRUST_PROXY"`
Expected: shows the `frontend` service's `80:80`/`443:443` port mappings, all four `deep_blue_lure_prod_*` volume names, and `TRUST_PROXY: "true"` under `backend`'s environment — confirms no service besides `frontend` publishes a port (grep for `8090:` or `5432:` should additionally return nothing: `docker compose -f docker-compose.prod.yaml --env-file .env.production.example config | grep -E "8090:|5432:"` expected to print nothing).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.prod.yaml
git commit -m "infra: add docker-compose.prod.yaml wiring TLS + automated backups"
```

---

### Task 6: `scripts/deploy/init-letsencrypt.sh`

**Files:**
- Create: `scripts/deploy/init-letsencrypt.sh`

**Interfaces:**
- Consumes: env vars `DOMAIN`, `CERTBOT_EMAIL` (Task 1); service names `frontend`, `certbot` and volume names `deep_blue_lure_prod_letsencrypt` (Task 5).
- Produces: a real Let's Encrypt certificate under the `deep_blue_lure_prod_letsencrypt` volume, and the full stack running. Run once per new domain, documented as a manual step in Task 7's runbook — never invoked automatically by `docker compose up`.

- [ ] **Step 1: Write `scripts/deploy/init-letsencrypt.sh`**

```bash
#!/usr/bin/env bash
# One-time bootstrap for a brand new domain: nginx's 443 server block needs a
# certificate to even start, but certbot needs nginx running (to answer the
# HTTP-01 challenge) to issue one. This breaks that chicken-and-egg problem
# with a throwaway self-signed cert, then swaps in the real one.
#
# Usage: DOMAIN=example.com CERTBOT_EMAIL=you@example.com ./scripts/deploy/init-letsencrypt.sh
set -euo pipefail

if [ -z "${DOMAIN:-}" ] || [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "Usage: DOMAIN=example.com CERTBOT_EMAIL=you@example.com $0" >&2
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.prod.yaml --env-file .env.production)
CERT_VOLUME="deep_blue_lure_prod_letsencrypt"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo "==> checking for an existing certificate for $DOMAIN"
if docker run --rm -v "$CERT_VOLUME":/etc/letsencrypt alpine test -d "$CERT_PATH"; then
  echo "Certificate already exists for $DOMAIN. Remove it first if you want to reissue." >&2
  exit 1
fi

echo "==> creating a dummy self-signed certificate so nginx can start"
docker run --rm -v "$CERT_VOLUME":/etc/letsencrypt alpine sh -c "
  apk add --no-cache openssl >/dev/null &&
  mkdir -p '$CERT_PATH' &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '$CERT_PATH/privkey.pem' \
    -out '$CERT_PATH/fullchain.pem' \
    -subj '/CN=localhost'
"

echo "==> starting nginx with the dummy certificate"
"${COMPOSE[@]}" up -d frontend

echo "==> deleting the dummy certificate"
docker run --rm -v "$CERT_VOLUME":/etc/letsencrypt alpine rm -rf "$CERT_PATH"

echo "==> requesting the real certificate from Let's Encrypt"
"${COMPOSE[@]}" run --rm --entrypoint "certbot certonly --webroot -w /var/www/certbot --email $CERTBOT_EMAIL -d $DOMAIN --rsa-key-size 2048 --agree-tos --no-eff-email" certbot

echo "==> reloading nginx with the real certificate"
"${COMPOSE[@]}" exec frontend nginx -s reload

echo "==> starting the rest of the stack"
"${COMPOSE[@]}" up -d

echo "==> done. https://$DOMAIN should now serve a real certificate."
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/deploy/init-letsencrypt.sh`

- [ ] **Step 3: Partial dry run — validate steps 1–3 (dummy cert + nginx starts and serves TLS) without calling the real Let's Encrypt API**

A real `certbot certonly` call needs a public, DNS-resolvable, internet-reachable domain — not available here. Validate everything up to that point by hand, mirroring the script's first three steps against a fake local domain:

```bash
docker volume create dbl_le_test >/dev/null

# Mirrors step "creating a dummy self-signed certificate"
docker run --rm -v dbl_le_test:/etc/letsencrypt alpine sh -c "
  apk add --no-cache openssl >/dev/null &&
  mkdir -p /etc/letsencrypt/live/test.localhost &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/test.localhost/privkey.pem \
    -out /etc/letsencrypt/live/test.localhost/fullchain.pem \
    -subj '/CN=localhost'
"

# Mirrors step "starting nginx with the dummy certificate"
docker run -d --rm --name dbl-le-test \
  -v "$(pwd)/docker/nginx.prod.conf.template":/etc/nginx/templates/default.conf.template:ro \
  -v dbl_le_test:/etc/letsencrypt:ro \
  -e DOMAIN=test.localhost -e NGINX_ENVSUBST_FILTER=DOMAIN \
  -p 8443:443 \
  nginx:1.27-alpine
sleep 1
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:8443/
```
Expected: `200` (nginx answers over TLS with the dummy certificate; the SPA `dist/` isn't built into this bare `nginx:1.27-alpine` image so it may instead be a `403`/`404` from the empty document root — either response proves TLS itself is working, since a TLS handshake failure would show as a curl connection error, not an HTTP status code).

- [ ] **Step 4: Tear down the dry run**

Run: `docker rm -f dbl-le-test; docker volume rm dbl_le_test`

- [ ] **Step 5: Note the untested portion in the script's own comment (already present) and in Task 7's runbook**

No code change — Task 7 documents that the real `certbot certonly` step (and therefore the full script end-to-end) is validated for the first time against the real domain on first deployment, as an explicit manual acceptance step, not automated here.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy/init-letsencrypt.sh
git commit -m "infra: add init-letsencrypt.sh to bootstrap TLS on a new domain"
```

---

### Task 7: `docs/deploy/production.md` (runbook)

**Files:**
- Create: `docs/deploy/production.md`

**Interfaces:**
- Consumes: every file/script/service name from Tasks 1–6 (referenced by exact path/name below).

- [ ] **Step 1: Write `docs/deploy/production.md`**

```markdown
# Production deploy runbook

This project has not been deployed to production yet. This document is the
checklist for when it is — a self-managed VPS running `docker compose`.

## First-time setup

1. Provision a VPS, point `DOMAIN`'s DNS A/AAAA record at it, open ports 80
   and 443.
2. Clone this repo onto the VPS.
3. Copy `.env.production.example` to `.env.production` and fill in every
   value — especially `POSTGRES_USER`/`POSTGRES_PASSWORD` (never the dev
   defaults), `ACCESS_TOKEN_SECRET` (`openssl rand -base64 48`), `DOMAIN`,
   and `CERTBOT_EMAIL`.
4. Run the one-time TLS bootstrap:
   ```bash
   DOMAIN=your-domain.example CERTBOT_EMAIL=you@your-domain.example \
     ./scripts/deploy/init-letsencrypt.sh
   ```
   This is the first time the real `certbot certonly` call runs end to end —
   treat a clean run here as the acceptance test for the whole TLS setup.
5. Confirm `https://your-domain.example` loads the app with a valid
   certificate, and that `http://your-domain.example` redirects to it.
6. Confirm backups are running: `docker compose -f docker-compose.prod.yaml
   --env-file .env.production logs backup` should show a
   `[backup] manifest written -> ...` line within `BACKUP_INTERVAL_SECONDS`
   of startup.

## Certificate renewal

The `certbot` service automatically renews within its 30-day expiry window
(checked every 12h) — no action needed. `certbot renew` alone doesn't reload
nginx, though, so add this to the VPS's own crontab (not inside any
container — deliberately not automated further, since it needs
`docker compose exec`, and giving the `certbot` container Docker-socket
access just to trigger this itself would be a bigger risk than a daily host
cron entry):

```cron
0 3 * * * cd /path/to/deep-blue-lure && docker compose -f docker-compose.prod.yaml --env-file .env.production exec frontend nginx -s reload
```

`nginx -s reload` is a no-op if nothing changed, so running it daily
regardless of whether a renewal actually happened is safe.

## Backups

- The `backup` service (`scripts/backup/backup.sh`) dumps the database every
  `BACKUP_INTERVAL_SECONDS` (default 86400 = daily) into the
  `deep_blue_lure_prod_pg_backups` volume, immediately restores it into a
  scratch database on the same server to prove it's valid, records a
  per-table row-count manifest from that restore, and deletes dumps older
  than `BACKUP_RETENTION_DAYS` (default 14) — except it never deletes the
  single newest backup, however old.
- **This is local-volume-only.** If the VPS itself is lost, the backups are
  lost with it. Off-site storage (e.g. an S3-compatible upload step appended
  to `scripts/backup/backup.sh`) is a deliberate next step once there's a
  real provider to pick — not built yet.
- To verify backups are actually restorable (not just "a file exists"), run,
  from any machine with `docker` and network access to the VPS's Docker
  daemon (or directly on the VPS):
  ```bash
  BACKUP_VOLUME=deep_blue_lure_prod_pg_backups ./scripts/backup/restore-test.sh
  ```
  It restores the newest backup into a disposable Postgres container and
  diffs its row counts against the manifest recorded at backup time, printing
  a pass/fail line per table. Non-zero exit = something is wrong with the
  most recent backup — investigate before trusting it for a real restore.
- This isn't wired into CI yet (there's no real production backup for CI to
  validate against) — run it by hand periodically until that's worth
  automating.

## Disaster recovery (restoring over a live database)

This is a deliberately manual, un-scripted procedure — restoring over a live
database is destructive and must never run unattended.

1. Stop the backend so nothing writes during the restore:
   `docker compose -f docker-compose.prod.yaml --env-file .env.production stop backend`
2. Pick the dump to restore from the `deep_blue_lure_prod_pg_backups` volume
   (list them: `docker run --rm -v deep_blue_lure_prod_pg_backups:/backups alpine ls -la /backups`).
3. Restore it over the real database (this **drops and recreates** existing
   objects it touches):
   ```bash
   docker run --rm --network deep-blue-lure-prod_default \
     -e PGPASSWORD=<POSTGRES_PASSWORD from .env.production> \
     -v deep_blue_lure_prod_pg_backups:/backups:ro \
     postgres:16-alpine \
     pg_restore -h postgres -U <POSTGRES_USER> -d <POSTGRES_DB> --clean --if-exists /backups/<chosen>.dump
   ```
4. Restart the backend: `docker compose -f docker-compose.prod.yaml --env-file .env.production start backend`.
5. Smoke-test the app before considering the incident resolved.

## Environment variable reference

See `.env.production.example` for the full list with inline comments. The
ones specific to this hardening work (not already used by the dev stack):

| Variable | Used by | Purpose |
|---|---|---|
| `DOMAIN` | `frontend`, `certbot`, `scripts/deploy/init-letsencrypt.sh` | The public domain nginx serves and certbot issues a certificate for |
| `CERTBOT_EMAIL` | `scripts/deploy/init-letsencrypt.sh` | Let's Encrypt expiry-notice contact |
| `BACKUP_RETENTION_DAYS` | `backup` service | How many days of dumps to keep (always keeps at least the newest one) |
| `BACKUP_INTERVAL_SECONDS` | `backup` service | How often `backup.sh` runs |
```

- [ ] **Step 2: Verify every referenced path actually exists**

Run:
```bash
for f in .env.production.example docker/nginx.prod.conf.template scripts/backup/backup.sh scripts/backup/restore-test.sh scripts/deploy/init-letsencrypt.sh docker-compose.prod.yaml; do
  test -f "$f" && echo "OK: $f" || echo "MISSING: $f"
done
```
Expected: every line prints `OK: <path>`.

- [ ] **Step 3: Commit**

```bash
git add docs/deploy/production.md
git commit -m "docs: add the production deploy runbook"
```

---

### Task 8: Correct `docs/analysis/security-checklist-20.md` and update `CLAUDE.md`

**Files:**
- Modify: `docs/analysis/security-checklist-20.md`
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Correct the #18 section (headers already shipped before this document was written)**

In `docs/analysis/security-checklist-20.md`, replace the `## 18. Security headers — ⚠️` section's `**Frontend estático (em falta)**` paragraph:

Find:
```
**Frontend estático (em falta)** — `docker/nginx.conf` **não adiciona headers**
ao HTML da SPA:
- sem CSP para a aplicação (a da API não protege a página servida pelo nginx),
- sem `Strict-Transport-Security`,
- sem `X-Frame-Options` / `frame-ancestors` no HTML,
- sem `Permissions-Policy`.

**Ação**: bloco `add_header` no nginx para o `location /` com CSP adequada à
SPA (scripts próprios + Vite/asset origin), HSTS, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
```

Replace with:
```
**Frontend estático — ✅ corrigido em `d9dd839` (2026-09-08), antes deste
documento.** `docker/nginx.conf`'s `location /` already sets
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `Strict-Transport-Security`, and a CSP scoped to the
SPA. The `Strict-Transport-Security` header only takes effect once served
over HTTPS — see #4, which was the remaining gap.
```

Also change the table row `| 18 | Security headers | ⚠️ |` to
`| 18 | Security headers | ✅ |`.

- [ ] **Step 2: Update #3 and #4's status**

Change the table rows:
```
| 3 | Configurar backups automáticos | ❌ |
| 4 | Forçar HTTPS | ⚠️ |
```
to:
```
| 3 | Configurar backups automáticos | ⚠️ |
| 4 | Forçar HTTPS | ⚠️ |
```

At the end of `## 3. Configurar backups automáticos — ❌` (heading also
changes to `⚠️`), after the existing `**Ação**` paragraph, append:

```

**Implementado, não exercitado em produção real (2026-09-11)**: serviço
`backup` em `docker-compose.prod.yaml` + `scripts/backup/backup.sh` (dump,
restore-verify local, manifesto de contagem por tabela, poda por retenção) +
`scripts/backup/restore-test.sh` (restauro independente + verificação). Ver
`docs/deploy/production.md`. Falta correr contra uma VPS/domínio reais e
decidir armazenamento off-site.
```

At the end of `## 4. Forçar HTTPS — ⚠️`, after the existing `**Ação**`
paragraph, append:

```

**Implementado, não exercitado em produção real (2026-09-11)**:
`docker/nginx.prod.conf.template` (redirect 80→443 + `listen 443 ssl`) +
serviço `certbot` em `docker-compose.prod.yaml` +
`scripts/deploy/init-letsencrypt.sh` para o bootstrap num domínio novo. Ver
`docs/deploy/production.md`. Falta correr o bootstrap contra um domínio real
(único passo que não pôde ser validado sem produção).
```

- [ ] **Step 3: Update the "Prioridades" section**

Find:
```
**Bloqueiam produção**
1. Backups automáticos do Postgres + teste de restauro (#3).
2. HTTPS forçado + HSTS no edge (#4, #18).
3. Retirar o write livre do blob `PUT /me/state` para utilizadores autenticados
   — concluir a Task 10.3 (#8).
```

Replace with:
```
**Bloqueiam produção**
1. Backups automáticos do Postgres + teste de restauro (#3) — implementado
   2026-09-11, falta exercitar contra uma VPS/domínio reais.
2. HTTPS forçado + HSTS no edge (#4, #18) — implementado 2026-09-11, falta
   exercitar o bootstrap do certbot contra um domínio real.
3. ~~Retirar o write livre do blob `PUT /me/state`~~ — feito, PR #40
   (`cf55a08`).
```

- [ ] **Step 4: Verify the stale text is gone**

Run: `grep -n "não adiciona headers" docs/analysis/security-checklist-20.md`
Expected: no output (the corrected paragraph no longer contains this phrase).

- [ ] **Step 5: Update `CLAUDE.md`'s commands table**

In `CLAUDE.md`, find the `## Comandos` table's last row (`| \`docker compose up\` | ... |`) and add two rows immediately after it:

```
| `docker compose -f docker-compose.prod.yaml --env-file .env.production up -d` | Sobe o stack de produção (TLS + backups) — precisa de `scripts/deploy/init-letsencrypt.sh` já ter corrido uma vez para o domínio |
| `./scripts/backup/restore-test.sh` | Restaura o backup mais recente num Postgres descartável e confere as contagens de linhas contra o manifesto |
```

- [ ] **Step 6: Verify the new rows are present**

Run: `grep -c "restore-test.sh\|docker-compose.prod.yaml" CLAUDE.md`
Expected: `3` or more (at least the two new table rows plus this section's own reference).

- [ ] **Step 7: Commit**

```bash
git add docs/analysis/security-checklist-20.md CLAUDE.md
git commit -m "docs: correct the security checklist and reference the new prod tooling"
```

---

## Self-review notes (from the plan author, before handoff)

- **Spec coverage**: Component 1 (TLS) → Tasks 2, 5, 6. Component 2 (backups)
  → Tasks 3, 4. Component 3 (env/docs/checklist) → Tasks 1, 7, 8. All spec
  sections have a task.
- **Deviation flagged**: Task 3 replaces the spec's `pg_export_snapshot`
  cross-connection mechanism with a same-server restore-verify, explained
  inline in that task's Interfaces section — same guarantee, simpler and
  more robust implementation, and it happens to also self-verify every
  backup at backup time (a strict improvement, not a scope cut).
- **Type/name consistency checked**: `BACKUP_VOLUME` default in Task 4
  matches the fixed volume name declared in Task 5. Service names
  (`frontend`, `certbot`, `postgres`, `backend`, `backup`) match between
  Tasks 5 and 6. Env var names in Task 1 match every later reference
  (`DOMAIN`, `CERTBOT_EMAIL`, `BACKUP_RETENTION_DAYS`,
  `BACKUP_INTERVAL_SECONDS`, `POSTGRES_USER/PASSWORD/DB`). `RUN_ONCE` is
  defined in Task 3 and used identically in Tasks 3 and 4's tests.
