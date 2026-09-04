# Deep Blue Lure Backend Architecture

Status: design baseline, 2026-09-04

## Scope

The backend is the authority for online identity, progression, economy, inventory, fishing outcomes, rankings, seasons, and competitive events. The browser remains responsible for presentation and input collection.

`localStorage` is supported only as a local-mode store and as a migration source. It is never trusted for competitive values.

## Technology decisions

| Area | Decision |
| --- | --- |
| Runtime | Node.js 20+ |
| Language | TypeScript |
| HTTP | Fastify |
| Database | PostgreSQL |
| Database access | Drizzle ORM |
| Validation | Zod |
| Authentication | Short-lived access token plus rotating refresh token |
| API contract | Versioned REST/JSON with OpenAPI |
| Tests | Vitest for domain/API and Playwright for end-to-end flows |

Redis and background jobs are optional infrastructure. They must not be required for the first authenticated vertical slice.

## Module boundaries

```text
auth          identity, credentials, sessions, refresh-token rotation
players       profile, progression, preferences
catalog       fish, regions, worlds, ruleset versions
fishing       fishing sessions, attempts, captures
economy       wallet ledger, purchases, sales, rewards
inventory     warehouse, aquarium, nets, multipliers, cosmetics
leaderboard   scores, ranking queries, snapshots
seasons       lifecycle, rules, eligibility, rewards
admin         audit queries and controlled moderation actions
shared        errors, validation, security, logging, identifiers
```

Modules own their application services and persistence queries. Cross-module changes use explicit service interfaces and database transactions; modules must not reach into another module's tables directly.

## Request flow

```text
HTTP request
  -> security and request limits
  -> authentication
  -> authorization
  -> schema validation
  -> application service
  -> domain rules
  -> transaction/repository
  -> audit event
  -> response schema
```

Error responses use a stable shape:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Safe user-facing message",
    "requestId": "request-id"
  }
}
```

Internal errors, SQL details, tokens, and secrets never appear in responses.

## Initial data model

The first authenticated slice will introduce:

- `users`: immutable identity, status, timestamps;
- `user_profiles`: username, country, display preferences;
- `sessions`: server-side session metadata and revocation state;
- `refresh_tokens`: hashed rotating token records and reuse detection;
- `player_progress`: level, XP, world and region unlocks;
- `catalog_versions`: active content/ruleset version;
- `audit_events`: security and state-changing operation trail.

The following domains are designed but intentionally deferred:

- `wallets`, `wallet_transactions`;
- `inventory_items`, `inventory_transactions`;
- `fishing_sessions`, `fishing_attempts`, `catches`;
- `leaderboard_scores`, `leaderboard_snapshots`;
- `seasons`, `season_rules`, `season_entries`, `season_rewards`.

Every user-owned row contains `user_id`. Foreign keys, unique constraints, check constraints, and indexes are part of the migration design. Monetary and inventory mutations are append-audited and transactional.

## Authentication contract

The planned flow is:

1. Register or login with validated credentials.
2. Return a short-lived access token.
3. Set or return a refresh token that is stored only in an approved secure client mechanism.
4. Rotate the refresh token on every refresh.
5. Revoke the token family on reuse detection or logout-all.

Password hashes use Argon2id or an equivalently configured password hashing scheme. Login responses do not reveal whether an account exists.

## First API contract

All future application routes are versioned under `/api/v1`.

Foundation routes:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Process liveness; no database required |
| GET | `/ready` | Dependency readiness |
| GET | `/openapi.json` | Public API contract |

Authentication routes to implement next:

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Start authenticated session |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Revoke current session |
| GET | `/api/v1/me` | Return current profile and progression summary |

All request and response bodies require Zod schemas and OpenAPI definitions. Mutating endpoints accept an idempotency key where replay could grant value.

## Local-save migration

Migration is explicit and one-way per account:

1. authenticate;
2. submit the versioned local envelope to a dry-run validation endpoint;
3. return accepted data and structured conflicts;
4. require user confirmation;
5. import accepted values transactionally;
6. record the migration source, version, result, and timestamp;
7. keep the local save as a temporary backup.

The server recomputes or caps XP, coins, inventory, catches, and unlocks. The client cannot select an authoritative final balance.

## Security baseline

- Validate every body, query, and path parameter.
- Authenticate and authorize every protected route.
- Apply per-route and per-identity rate limits.
- Hash refresh tokens at rest.
- Use short token lifetimes and rotation.
- Use idempotency for rewards, purchases, and captures.
- Keep secrets in environment variables or a secret manager.
- Restrict CORS by environment.
- Add secure headers and CSP at the edge/API.
- Log security events without credentials or personal secrets.
- Use database transactions for all value mutations.
- Add replay, impossible-frequency, and impossible-progression detection before competition.

## Threat model

| Threat | Control |
| --- | --- |
| Forged client balance or XP | Server-side domain calculations and ledger |
| Replay of reward/purchase request | Idempotency keys and unique constraints |
| Refresh-token theft | Hashing, rotation, reuse detection, revocation |
| Cross-user access | Resource authorization using authenticated `user_id` |
| Brute-force login | Rate limits, generic errors, audit events |
| Malformed payloads | Zod schemas and bounded request sizes |
| SQL injection | Drizzle parameterization and no string-built queries |
| Ranking manipulation | Server-owned score events and ruleset versions |
| Secret leakage | Environment-only secrets and staged-file checks |
| Operational outage | Health/readiness endpoints, structured logs, backups |

## Definition of done for the foundation

- Backend typecheck passes.
- Existing frontend build remains green.
- Unit and API tests pass.
- No secrets are committed.
- Health and readiness behavior is documented and tested.
- The first migration is reproducible.
- Authentication design is reviewed before implementation.
