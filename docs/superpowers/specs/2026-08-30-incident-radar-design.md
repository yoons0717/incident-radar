# Incident Radar — Design Spec

Date: 2026-08-30
Status: Approved for planning

## 1. Purpose

Real-time error monitoring and alerting service. Services report errors; when a
service's error count crosses a threshold within a sliding time window, the
system dispatches an alert asynchronously, with deduplication (cooldown) and
retry with exponential backoff. If Redis is unavailable, error counting falls
back to a database query so threshold detection keeps working (dispatch itself
pauses while Redis is down — see section 5.5).

The system is delivered as a pnpm + Turborepo monorepo with a NestJS backend, a
Next.js frontend dashboard, and a shared package holding the Zod schemas that
both apps import as the single source of truth for the API contract.

## 2. Scope

### In scope (core)

- Error ingestion and history query.
- Redis sliding-window per-service error counting (Sorted Set based).
- Threshold detection -> asynchronous alert dispatch (BullMQ) with exponential
  backoff retry; exhausted retries recorded to a failures table.
- Cooldown-based alert deduplication (`SET NX EX`).
- Redis health probe with fallback to a database `COUNT` query when Redis is down.
- Latency logging for the ingest -> alert-enqueued path, tagged with the counting
  path taken (`redis` or `db-fallback`).
- Basics: unit tests, one e2e set, GitHub Actions CI (lint + test), TypeORM
  migrations (no `synchronize`), OpenAPI docs via `@nestjs/swagger`, structured
  logging via `nestjs-pino`, `/health` endpoint, `helmet`, explicit CORS,
  `.env.example`, IP rate limit on `POST /errors`, README with a mermaid
  architecture diagram and design-rationale section.
- Frontend overview dashboard: per-service error trend line chart, current
  cooldown state, recent alert history table, each with loading / error / empty
  states and Zod runtime validation of every API response.
- `docker-compose.yml` bringing up Postgres, Redis, backend, frontend with one
  command.

### Out of scope (stretch — build only if time remains, in this order)

1. Fixed-window counter implementation behind the `CounterStrategy` interface,
   plus a README comparison note.
2. Performance report page and a `GET /metrics/latency` endpoint comparing the
   Redis path against the DB fallback path.
3. Auth.js admin login gating the dashboard.
4. 3D service radar at `/radar` (react-three-fiber + drei).
5. k6 load test script (100 rps, p95) and a cooldown before/after alert-count
   comparison script.

The `CounterStrategy` interface ships in the core with only the sliding-window
implementation. The interface is a seam for stretch item 1, not speculative
abstraction: the fallback path (section 5.5) already needs a second counter
implementation selected at runtime, so the seam earns its place immediately.

## 3. Time budget

Approximately 40 hours (about one week at 6 hours/day). The scope split above is
driven by this budget. If a core item overruns, stretch items are dropped, not
core items.

## 4. Monorepo layout

```
incident-radar/
  apps/
    backend/      NestJS + TypeORM + BullMQ
    frontend/     Next.js (App Router) + Tailwind + shadcn/ui
  packages/
    shared/       Zod schemas + inferred TypeScript types
  docker-compose.yml
  turbo.json
  pnpm-workspace.yaml
  .env.example
```

- Package manager: pnpm workspaces.
- Task runner: Turborepo (`turbo lint`, `turbo test`, `turbo build`, `turbo dev`).
- `packages/shared` is consumed by both apps via the workspace protocol
  (`"@incident-radar/shared": "workspace:*"`).

## 5. Backend design

### 5.1 Ingestion and history

- `POST /errors` with body `{ service: string, message: string }`. Validated by a
  Zod-backed validation pipe using the `ErrorLogInput` schema from
  `packages/shared`. Inserts one row into `error_logs`.
- `GET /errors?service=&from=&to=&limit=` returns matching rows ordered by
  `created_at` descending. `service` is required; `from` / `to` are optional ISO
  timestamps; `limit` defaults to 100 and is capped at 1000 so the endpoint
  cannot be made to return an unbounded result set.
- `error_logs` table: `id` (uuid pk), `service` (text), `message` (text),
  `created_at` (timestamptz, default now). Composite index on
  `(service, created_at)`.

**Concepts:** TypeORM migration files (never `synchronize: true`); why a
composite index on `(service, created_at)` serves the per-service time-range
query (leftmost-prefix rule); request validation at the trust boundary with Zod.

### 5.2 Sliding-window counter (Redis)

`CounterStrategy` interface:

```
interface CounterStrategy {
  record(service: string, at: number): Promise<number>; // returns current window count
}
```

`RedisSlidingWindowCounter` implementation, per service key
`count:<service>` (a Sorted Set):

1. `ZADD count:<service> <at> <unique-member>` — member is a unique id
   (`<at>-<random>`), score is the event timestamp in ms.
2. `ZREMRANGEBYSCORE count:<service> 0 <at - windowMs>` — drop events older than
   the window.
3. `ZCARD count:<service>` — the count of events currently inside the window.
4. `PEXPIRE count:<service> <windowMs * 2>` — safety TTL so an idle service's key
   is reclaimed.

Steps 1-4 run in a single pipeline / `MULTI` so the count reflects one
consistent state.

**Concepts:** why a Sorted Set gives a true sliding window, versus fixed-window
`INCR` + `EXPIRE` which double-counts across the boundary (a burst spanning two
adjacent fixed windows can be up to 2x the threshold without ever tripping it);
cost of trimming on every write; the safety TTL.

### 5.3 Threshold detection and cooldown

- After `record()` returns `count`, if `count > threshold` the service is a
  candidate for alerting. There is a single global `threshold` and `windowMs`
  from env (defaults: threshold 10, window 60000 ms), applied identically to
  every service. Per-service thresholds are a possible later extension, not in
  this build.
- Before enqueuing, attempt the cooldown lock:
  `SET cooldown:<service> 1 NX EX <cooldownSeconds>`.
  - Reply `OK` -> lock acquired -> enqueue the alert job.
  - Reply `nil` -> a cooldown is already active -> skip silently.

**Concepts:** `SET key val NX EX` is a single atomic operation, so it is a safe
distributed lock for "one alert per service per cooldown window"; a
`GET`-then-`SET` sequence is a race (two requests both read no key, both write).

### 5.4 Alert dispatch (BullMQ)

- A BullMQ queue `alerts` on the existing Redis instance. The threshold path adds
  a job `{ service, count, windowMs, threshold, at }`.
- A BullMQ worker processes the job by calling a webhook URL from config. If no
  URL is configured, it logs a structured "alert dispatched" line (mock sink).
- Job options: `attempts: 5`, `backoff: { type: 'exponential', delay: 1000 }`
  (1s, 2s, 4s, 8s, 16s). A small random jitter is added in a custom backoff
  strategy to avoid synchronized retries.
- On success, a `completed` listener inserts a row into `alerts`: `id`,
  `service`, `count`, `threshold`, `window_ms`, `status` = `dispatched`,
  `at` (timestamptz).
- On `failed` after the final attempt, a `failed` listener inserts a row into
  `alert_failures`: `id`, `service`, `payload` (jsonb), `error` (text),
  `attempts` (int), `failed_at` (timestamptz). This is the "failure history
  persisted separately" requirement — kept as its own table rather than a status
  value so a full failure record (payload, last error, attempt count) is
  queryable without widening `alerts`.
- The webhook call carries an idempotency key (`<service>:<window-start-epoch>`)
  in a header so a duplicate delivery from an at-least-once retry is
  recognizable by the receiver.

**Concepts:** queue-based async processing decouples ingestion latency from
dispatch latency; at-least-once delivery and why the consumer must be idempotent;
exponential backoff with jitter; the dead-letter pattern (here: a failures table
rather than a separate queue, which is enough at this scale).

### 5.5 Redis failure and DB fallback

- A health component pings Redis every 5 seconds and also flips the flag on any
  command-level connection error. State is a single boolean
  `redisHealthy`.
- The counter is selected per call: `redisHealthy` -> `RedisSlidingWindowCounter`;
  otherwise -> `DbCountCounter`, which runs
  `SELECT COUNT(*) FROM error_logs WHERE service = $1 AND created_at > now() - $2::interval`.
- The DB fallback is coarser: it counts from a fixed interval boundary measured
  from "now", it has no sub-second precision, and it adds database load. This is
  accepted: the alternative (failing closed when Redis is down) is worse for an
  alerting system.
- Cooldown and dispatch still require Redis (BullMQ needs it). When Redis is
  down, threshold detection via the DB path still runs and logs, but alert
  enqueue is skipped and a structured "alert suppressed: redis down" line is
  emitted. So while Redis is down the counting path degrades gracefully but the
  alerting path is effectively paused. This is a known ceiling for the 40-hour
  build; a fuller design would use a DB-backed outbox drained when Redis
  recovers.

**Concepts:** graceful degradation and failing open vs closed; a health flag is
enough here, a full circuit breaker (half-open probing, rolling error windows) is
not warranted at this scale.

### 5.6 Latency logging

- A timestamp is captured when `POST /errors` is received and again when the
  alert job is enqueued (or when the threshold path completes without enqueue).
- One `nestjs-pino` structured line per ingested error:
  `{ service, count, path: 'redis' | 'db-fallback', enqueued: boolean, latencyMs }`.

**Concepts:** structured logging as the basis for later latency comparison
without a metrics stack; measuring the two counting paths from the same log
field.

### 5.7 Dashboard support endpoints

- `GET /stats?service=&from=&to=&bucket=` — error counts bucketed by a fixed
  interval (default 1 minute) for the trend chart. Returns
  `{ service, buckets: { t: string, count: number }[] }[]`.
- `GET /status` — `ServiceStatus[]`. "Known services" are the distinct `service`
  values in `error_logs` within the last 24 hours. For each: its current window
  count (via the active counter, Redis or fallback) and whether
  `cooldown:<service>` is set, with its TTL.
- `GET /alerts?limit=` — recent alert history for the table, a union of `alerts`
  (`status: dispatched`) and `alert_failures` (`status: failed`) ordered by time
  descending.

## 6. Shared package (`packages/shared`)

Zod schemas and their inferred types, one module, re-exported from the package
root:

- `ErrorLogInput` — `{ service, message }` (POST body).
- `ErrorLog` — a stored row `{ id, service, message, createdAt }`.
- `Alert` — one row of alert history for the table, from either `alerts` or
  `alert_failures`:
  `{ id, service, status: 'dispatched' | 'failed', at, count?, threshold?, windowMs?, attempts?, error? }`
  (the count/threshold/windowMs fields are present for `dispatched`, the
  attempts/error fields for `failed`).
- `ServiceStatus` — `{ service, windowCount, cooldownActive, cooldownTtlSec }`.
- `StatsResponse` — the `GET /stats` shape.
- `AlertFailure` — a row from `alert_failures`.

Types are `z.infer<typeof Schema>`. The backend uses the input schemas in
validation pipes and validates its own responses in tests; the frontend parses
every response with the response schemas.

**Concepts:** one source of truth for the contract; `z.infer` to avoid
hand-written duplicate types; why runtime parsing still matters when the types
are shared (the running server can return something the compiler never checked —
a schema drift, a serialization bug, a proxy error body).

## 7. Basics

### 7.1 Tests

Unit (Jest):

- Sliding-window count: events inside the window are counted; an event older than
  `windowMs` is trimmed and not counted; the boundary case (`at - windowMs`
  exactly) is defined and tested.
- Cooldown: first call acquires the lock and returns "enqueue"; a second call
  within the window returns "skip"; a call after TTL expiry acquires again.
- Fallback selection: `redisHealthy = false` routes `record()` to `DbCountCounter`;
  `true` routes to the Redis implementation.

Determinism: an injectable clock (a `now()` provider) is used so tests do not
sleep. Redis and Postgres are real instances, not mocks, for the
integration-level unit tests of the counter — provided by CI service containers
in GitHub Actions and by a `docker-compose.test.yml` locally.

e2e (`supertest`, one set):

- Seed nothing. `POST /errors` for one service N times where N > threshold within
  the window. Assert: exactly one alert is dispatched (the cooldown suppresses
  the rest), `alert_failures` is empty, `GET /errors?service=` returns N rows,
  `GET /status` shows the service with `cooldownActive: true`.

**Concepts:** deterministic time via dependency injection; testing against real
Redis/Postgres in CI service containers rather than mocking away the behavior
under test.

### 7.2 CI

GitHub Actions, triggered on `push` and `pull_request`:

- `pnpm install --frozen-lockfile`
- `pnpm turbo lint`
- `pnpm turbo test` with `postgres` and `redis` service containers and the env
  they need.

### 7.3 Migrations

- TypeORM DataSource configured with `synchronize: false`, `migrations` glob set.
- Migration files committed under `apps/backend/src/migrations`.
- `pnpm --filter backend migration:run` is invoked by the backend container's
  entrypoint before the app starts, and as a step in CI before tests.

### 7.4 API docs

`@nestjs/swagger` with DTO decorators; served at `/docs`. The OpenAPI JSON is
available at `/docs-json`.

### 7.5 Observability

- `nestjs-pino` for structured request logging and app logs; pretty transport in
  dev, JSON in production.
- `GET /health` checks the database connection and Redis. Returns `503` when the
  database is down. When the database is reachable it returns `200` with
  `{ status: 'ok' | 'degraded', db: 'up', redis: 'up' | 'down' }` — `degraded`
  when Redis is down, since counting still works via fallback but the alerting
  path is paused. Redis being down does not by itself fail the check.

### 7.6 Security

- `helmet` on the Nest app.
- CORS configured explicitly from `CORS_ORIGIN` env (the frontend origin); not
  `origin: true`.
- `.env.example` lists every variable with placeholder values; real `.env` is
  gitignored.
- `@nestjs/throttler` applied to `POST /errors`, keyed by client IP, limit from
  env (default 100 requests per minute per IP).

### 7.7 README

- Mermaid architecture diagram (ingestion -> counter -> threshold -> cooldown ->
  queue -> worker -> webhook, with the Redis-down fallback branch).
- "Design rationale" section explaining: sliding window vs fixed window; BullMQ +
  exponential backoff + failures table vs in-process retry; fallback failing open
  vs closed; `SET NX EX` for cooldown.
- Local run instructions (`docker compose up`) and the per-endpoint curl
  examples.

## 8. Frontend design

Stack: Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
(5-second polling), Zustand (UI-only state: selected service, selected time
range), recharts.

Single route `/` (overview dashboard) with three panels:

- **Error trend** — a recharts line chart from `GET /stats`, one line per
  service, over the selected time range.
- **Cooldown state** — from `GET /status`; lists services currently in cooldown
  with the remaining TTL.
- **Recent alerts** — a table from `GET /alerts`; newest first; failed alerts
  visually distinguished.

Each panel independently renders loading, error, and empty states. Every response
is parsed with the corresponding Zod schema from `packages/shared` before it
reaches component state; a parse failure renders the panel's error state.

Accessibility: semantic landmarks (`main`, `section` with headings), visible
keyboard focus styles retained, the alerts table wrapped in an `aria-live`
region so a newly polled alert row is announced.

**Concepts:** TanStack Query cache keys, `staleTime`, and polling via
`refetchInterval`; parsing at the boundary even with shared types; separating
server state (TanStack Query) from ephemeral UI state (Zustand).

## 9. docker-compose

Services:

- `postgres` (with a named volume, healthcheck).
- `redis` (healthcheck).
- `backend` — depends on both healthy; entrypoint runs `migration:run` then
  `node dist/main`.
- `frontend` — depends on `backend`; runs the Next.js production server; built
  with `NEXT_PUBLIC_API_URL` pointing at `backend`.

All configuration via environment variables documented in `.env.example`.

## 10. Execution order

Each step ends in something demonstrable.

1. Scaffold: pnpm workspace + Turborepo + the three packages; `git init`. Verify
   `pnpm dev` boots both apps.
2. `packages/shared`: author the Zod schemas. Verify a backend file imports a
   type and typechecks.
3. Backend ingestion: first migration, `error_logs`, `POST /errors`,
   `GET /errors`. Verify with curl.
4. Redis sliding-window counter + threshold detection (log only, no alert yet).
   Verify a curl burst produces the count log.
5. Cooldown + BullMQ alert dispatch + retry + `alert_failures`. Verify a burst
   produces exactly one alert; force a webhook failure and observe the backoff
   retries then the failures row.
6. Redis-down fallback: stop the Redis container, curl, observe the
   `db-fallback` path log and that ingestion still succeeds.
7. Basics, in order: tests -> CI -> Swagger -> pino + `/health` -> security ->
   README.
8. Frontend overview dashboard.
9. `docker-compose` full stack up with one command.
10. Stretch items in the section 2 order, as time allows.

The implementation plan breaks each step into 5-15 minute sub-tasks, each tagged
with the concept it exercises.
