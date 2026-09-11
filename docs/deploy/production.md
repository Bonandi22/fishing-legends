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
