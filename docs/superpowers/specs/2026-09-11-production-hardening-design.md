# Design: production hardening — automated Postgres backups + forced HTTPS/HSTS

Date: 2026-09-11
Status: approved for planning

## Context

`docs/analysis/security-checklist-20.md` names three items that "block production":
backups (#3), forced HTTPS (#4), and retiring the free-form `PUT /me/state` write
(#8). #8 is done (PR #40, merged `cf55a08`). This spec covers the remaining two.

**This project is not going to production yet.** The goal is to leave the
automation, configuration, and documentation ready in the repository so that
turning it on is a matter of running scripts against a real VPS and real
domain, not writing new code under pressure. Nothing here runs against a real
production database or a real domain during this work; validation happens
against the existing local dev stack and disposable containers.

**Correction to the checklist**: SPA security headers (#18) — including
`Strict-Transport-Security` — were already added to `docker/nginx.conf` in
`d9dd839` (2026-09-08), before the checklist document was written. The
checklist's "Lacunas" section for #18 is stale and gets corrected as part of
this work. What's actually still missing for #4 is TLS termination itself
(certificate + `listen 443` + the 80→443 redirect) — the header is already
correct once something serves the page over HTTPS.

**Target environment**: a self-managed VPS running `docker compose` (chosen
explicitly over a managed Postgres or a PaaS — no managed backup or edge TLS
to lean on). Everything must be built into this repository.

## Current state (verified in this codebase)

- `compose.yaml` is dev-only: frontend builds with `target: dev` (Vite dev
  server), never the nginx `runtime` target. There is no production compose
  file anywhere in the repo today.
- `Dockerfile` (frontend) already has a `runtime` target: nginx 1.27, bakes in
  `docker/nginx.conf` at build time, serves `dist/` on port 80, no TLS.
- `backend/Dockerfile` already has a `runtime` target: runs
  `npm run backend:db:migrate && npm run backend:start` under `tini`, as
  `node`, with a `/health` healthcheck. Nothing to change here.
- `docker/nginx.conf` already sets the full security header set for the SPA
  (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`, CSP) and proxies `/api/`
  to the backend same-origin. It listens on port 80 only.
- `.gitignore` ignores `.env` and `.env.*` except allow-listed `*.example`
  files (`.env.example`, `.env.docker.example`).
- No backup automation of any kind exists in the repo.
- Drizzle schema (`backend/src/db/schema.ts`) currently has 13 tables. The
  restore-test design below deliberately does not hardcode this list (see
  Component 2).

## Architecture overview

One new file ties everything together: `docker-compose.prod.yaml`, a
standalone compose file (not an overlay on `compose.yaml` — the two stacks
share no services and mixing them invites accidentally running dev's `target:
dev` frontend in "production"). It defines:

- `postgres` — same image as dev, but production credentials come from
  `.env.production` (never the dev defaults), plus a named volume for data.
- `backend` — `backend/Dockerfile` at `target: runtime`.
- `frontend` — `Dockerfile` at `target: runtime` (nginx), but with
  `docker/nginx.prod.conf` bind-mounted over the image's baked-in config, plus
  the certbot webroot and certificate volumes. This container is the actual
  TLS edge — there is no separate "nginx" or "edge" service; `frontend` has
  always been nginx once built at `runtime`, this just gives it certificates.
- `certbot` — `certbot/certbot`, shares the webroot volume with `frontend` for
  HTTP-01 challenges and the `letsencrypt` volume for certificates/keys. Runs
  a renewal-check loop (see Component 3).
- `backup` — `postgres:16-alpine` (for its bundled `pg_dump`/`psql`), running
  `scripts/backup/backup.sh` in a loop (see Component 2).

Two new script directories:
- `scripts/backup/` — `backup.sh` (the recurring job) and `restore-test.sh`
  (the verification tool, run manually or from CI later).
- `scripts/deploy/` — `init-letsencrypt.sh` (one-time bootstrap for a brand
  new domain).

New env template `.env.production.example` (git-ignored `.env.production` is
the real file an operator creates from it) and a new runbook,
`docs/deploy/production.md`.

## Component 1: TLS termination on the `frontend` container

**Problem being solved**: `docker/nginx.conf` only listens on port 80 with no
certificate. Every request is plaintext; the `Strict-Transport-Security`
header it already sends is meaningless without HTTPS to enforce.

**Design**: a new `docker/nginx.prod.conf`, structurally identical to
`docker/nginx.conf` (same `/api/` proxy, same SPA fallback, same security
headers, same asset caching) but with two `server` blocks instead of one:

- `listen 80`: serves `/.well-known/acme-challenge/` from the shared certbot
  webroot (so HTTP-01 challenges keep working after the first issuance, for
  renewals); every other path gets a `301` redirect to `https://$host$request_uri`.
- `listen 443 ssl`: the real server block — everything `docker/nginx.conf` has
  today, plus `ssl_certificate`/`ssl_certificate_key` pointing at
  `/etc/letsencrypt/live/${DOMAIN}/{fullchain,privkey}.pem`, and
  `ssl_protocols TLSv1.2 TLSv1.3`.

`docker/nginx.conf` itself is **not modified or removed** — it stays the image's
baked-in default, useful for a deployment where TLS is already terminated
upstream (a load balancer or CDN in front of the container), matching the
checklist's original phrasing of the action ("no edge (load balancer OU
nginx)"). `docker-compose.prod.yaml` is what opts into `nginx.prod.conf` via a
bind mount, not a Dockerfile change.

**Bootstrapping a brand new domain** (the chicken-and-egg problem: the `443`
server block won't let nginx start without a certificate that doesn't exist
yet): `scripts/deploy/init-letsencrypt.sh`, following the standard
certbot+nginx-in-docker-compose pattern:

1. If no certificate exists yet for `$DOMAIN` under the `letsencrypt` volume,
   generate a throwaway self-signed one at the exact path nginx expects, so
   the `443` block has something to bind to.
2. Start `frontend` (nginx now boots successfully).
3. Delete the throwaway certificate.
4. Run `certbot certonly --webroot` against the running nginx to obtain the
   real certificate for `$DOMAIN`.
5. Reload nginx (`docker compose exec frontend nginx -s reload`) to pick up
   the real certificate.

This script is run once per new domain, by hand, documented in the runbook —
it is explicitly not part of the automatic startup path, so a normal
`docker compose up` on an already-bootstrapped host never touches it.

**Renewal**: the `certbot` service's entrypoint is a loop:
`certbot renew --webroot -w <webroot>` followed by `sleep 12h`, forever.
`certbot renew` is a no-op unless a certificate is within its renewal window
(~30 days of expiry by default), so this is safe to run this often
indefinitely.

**Picking up a renewed certificate**: nginx does not watch the certificate
files for changes, so a renewed cert needs an `nginx -s reload` to take
effect. Rather than give the `certbot` container access to the Docker socket
(so it could reach into the `frontend` container itself — a real privilege
escalation risk for a container whose only job is talking to Let's Encrypt),
the runbook documents a host-level cron entry:
`docker compose -f docker-compose.prod.yaml exec frontend nginx -s reload`,
once a day. `nginx -s reload` is safe to run even when nothing changed.

## Component 2: automated Postgres backups + restore verification

**`scripts/backup/backup.sh`** (the `backup` service's entrypoint, looping
forever under `sleep $BACKUP_INTERVAL_SECONDS` — no cron daemon needed, the
`postgres:16-alpine` image doesn't have one installed and adding one is more
moving parts than a shell loop):

1. Take a consistent, exactly-reproducible snapshot of the database: open one
   `psql` session, run `SELECT pg_export_snapshot()` to get a snapshot id,
   and in a second `psql` session `SET TRANSACTION SNAPSHOT '<id>'` before
   counting rows in every base table under the schema returned by
   `information_schema.tables` (no hardcoded table list — the schema is free
   to change without updating this script). Write that as
   `<timestamp>.manifest.json` (`{ "table_name": row_count, ... }`).
2. While the snapshot-holding session from step 1 is still open, run
   `pg_dump --snapshot='<id>' --format=custom` against the same database into
   `<timestamp>.dump.gz`-equivalent (`pg_dump -Fc` is already compressed; no
   extra gzip needed).
3. Close the snapshot-holding session.
4. Prune: delete any `*.dump`/`*.manifest.json` pair whose file `mtime` is
   older than `$BACKUP_RETENTION_DAYS` (default 14) — **except** it never lets
   the directory reach zero backups; if pruning would remove the last
   remaining pair, it keeps that one regardless of age (protects against
   `BACKUP_INTERVAL_SECONDS` misconfigured longer than the retention window
   silently deleting the only backup that exists).

Both the dump and its manifest live in the same named volume
(`pg_backups`), which is also mounted (read-only) into wherever
`restore-test.sh` runs from.

**`scripts/backup/restore-test.sh`** (run by hand today; a candidate for a
scheduled CI job once there's a real production backup to validate — not
built now, out of scope per YAGNI until that's a real need):

1. Find the newest `*.dump` / `*.manifest.json` pair in the backups volume.
2. Start a disposable, unnamed `postgres:16-alpine` container on a random
   port with a throwaway superuser password (never touches the real
   `postgres` service or its volume).
3. `pg_restore` the dump into it.
4. Run the identical `information_schema.tables` row-count query against the
   restored database and diff the result against the stored manifest.
5. Print a pass/fail summary per table (not just an aggregate) and exit
   non-zero on any mismatch or on a missing/empty backups volume.
6. Tear down the disposable container unconditionally (`trap ... EXIT`), pass
   or fail.

**Validating this now, without a real production database**: run
`restore-test.sh` against a backup taken from the existing local dev
`compose.yaml` Postgres (`docker compose up`, already has seeded test data
from normal dev use) — proves the dump → restore → verify cycle actually
works end to end, using real (if small) data, without touching anything
production-shaped.

## Component 3: environment, docs, and checklist correction

- **`.env.production.example`** (new, needs `!.env.production.example` added
  to `.gitignore`'s allow-list — the pattern already exists for the other two
  example files): production values for every var `.env.docker.example` has
  (`COOKIE_SECURE=true`, `TRUST_PROXY=true` since nginx now proxies, a real
  `CORS_ORIGINS=https://${DOMAIN}`, `COOKIE_DOMAIN=${DOMAIN}`), plus the new
  ones this spec introduces: `DOMAIN`, `CERTBOT_EMAIL`,
  `BACKUP_RETENTION_DAYS`, `BACKUP_INTERVAL_SECONDS`, and **non-default**
  `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` placeholders (the dev
  compose's `deepbluelure`/`deepbluelure` must never be reused).
- **`docs/deploy/production.md`** (new): the runbook — first-time deploy
  (`init-letsencrypt.sh`, then `docker compose -f docker-compose.prod.yaml up
  -d`), the renewal cron entry, how backups are scheduled and where they
  land, how to run `restore-test.sh` and read its output, and the disaster
  recovery procedure (`pg_restore` a chosen dump into the real `postgres`
  service — explicitly a manual, deliberate action, never scripted, since
  restoring over a live database is destructive).
- **`docs/analysis/security-checklist-20.md`**: #3 and #4 move from ❌/⚠️ to
  "implemented, not yet exercised against a real production deployment"
  (not a flat ✅ — nothing here has run against a real VPS or domain yet);
  #18's "Frontend estático (em falta)" section is corrected to note the
  headers already shipped in `d9dd839`, predating this document.
- **`CLAUDE.md`**: append the two new scripts to the commands table and a
  short mention of `docker-compose.prod.yaml` under the existing Docker
  section — additive only, no existing rows change.

## Testing / validation plan (this work, today, no real production)

- `docker compose -f docker-compose.prod.yaml config` with a dummy
  `.env.production` — confirms the compose file itself is syntactically valid
  and every required env var resolves.
- `nginx -t` inside a throwaway container running `docker/nginx.prod.conf`
  against locally-generated self-signed certs — confirms the config parses
  and the `443` block is well-formed, without needing a real certificate or
  domain.
- `scripts/backup/backup.sh` run once by hand against the existing dev
  `compose.yaml` Postgres — produces a real dump + manifest pair.
- `scripts/backup/restore-test.sh` run against that pair — proves the full
  dump → restore → verify cycle, including the row-count diff, actually
  passes (and, as a negative check during development, that it correctly
  fails when a table is deliberately left out of the restore).
- No test touches the real dev database destructively, no test requires a
  domain or a real TLS certificate, and nothing in this spec is added to
  `docker compose up` (the existing dev command) — it is all net-new files
  plus one new compose file, so the existing dev/test workflow is unaffected.
  Frontend/backend unit and integration suites are expected to be unaffected
  (no application code changes) and are re-run as a regression check only.

## Out of scope (explicitly deferred)

- Off-site backup storage (S3-compatible upload) — the local-volume-only
  design is what the user asked for now; the runbook notes this as the
  documented next step once a real VPS exists to decide a provider against.
- Wiring `restore-test.sh` into CI — no scheduled backups exist yet for CI to
  validate; revisit once production backups are real.
- Any change to `compose.yaml` (the dev stack) — production is fully
  separate.
- Rate-limit bucket changes, dependency scanning, or any other checklist item
  besides #3/#4 (and the #18 documentation correction, which costs nothing
  since #18 code is already done).
