# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Langphy backend — a polyglot, multi-service backend for a German-language learning app (Expo client). It is an **npm workspaces** monorepo containing ~17 Node.js/TypeScript Express services, two Python services, plus shared infrastructure. It is designed to deploy via **Docker Compose on Railway**.

## Common commands (run from repo root)

```bash
# Clean slate (rm all node_modules + reinstall)
npm run clean && npm install

# Build shared package first — every TS service imports @langphy/shared
npm run build -w shared

# Build all PG-backed services (auth, profile, performance, progress, settings, streaks, gateway, notification)
npm run build

# Dev a single service (hot-reload via nodemon)
npm run dev                  # = npm run dev -w services/auth
npm run dev -w services/streaks

# Build a single service (use -c to wipe previous dist)
npm run build -w services/auth -c

# Tsup issue fix — install dev dep at root if a service fails to build shared artifacts
npm install -D tsup

# Build all Docker images & push to Docker Hub (run from repo root)
bash build-and-push.sh

# Locally run the full stack
docker compose up -d
```

There are **no unit/e2e tests** in this repo (the templates folder documents a planned structure — `tests/unit/`, `tests/e2e/` — but they are not implemented).

## Repo layout

```
.
├── package.json              # npm workspaces root
├── tsconfig.base.json        # maps @shared/* -> shared/*
├── docker-compose.yml        # full prod stack for Railway
├── build-and-push.sh         # builds & pushes every service image to Docker Hub
├── DEPLOYMENT_GUIDE.md       # K8s→Compose migration notes
├── RAILWAY_DEPLOY.md         # Railway deploy walkthrough
├── shared/                   # @langphy/shared package (zod schemas, Kafka client, topic constants)
├── services/
│   ├── auth, streaks, progress, performance, profile, settings,
│   │   notification, gateway-service       # Postgres-backed, Kafka producers/consumers
│   ├── category, unit, practice, quiz,
│   │   speaking, reading, writing, listening  # MongoDB Atlas (content)
│   ├── nlp-service           # Python (spaCy)
│   └── speech-service        # Python (Faster-Whisper) — single image, two entrypoints
├── infra/
│   ├── postgres/             # Dockerfile + init.sql (creates 8 databases)
│   └── caddy/                # Dockerfile + Caddyfile (reverse proxy)
└── templates/AGENTS.md.template
```

## Architecture: service boundaries

**Postgres services** (one DB each, name = `langphy_<service>`):
| Service | Port | Role |
|---|---|---|
| auth | 3000 | Signup (OTP), signin, JWT issue, password reset, account delete; **publishes** `user.registered.v1`, `user.deleted.v1` |
| streaks | 3001 | Streak math; **consumes** `session.completed` |
| progress | 3002 | Lesson/word progress; **consumes** `lesson.completed` |
| performance | 3003 | Analytics; no Kafka |
| profile | 3004 | User profile; **consumes** `user.registered.v1` |
| settings | 3005 | App preferences; **consumes** user events |
| notification | 4011 | Push notifications + cron-driven reminders; **consumes** many topics |
| gateway-service | 3009 | Aggregates client-side events; **producer** |

**MongoDB services** (Atlas, `MONGO_URI`): content (category/unit/practice/quiz/speaking/reading/writing/listening).

**AI / infra**: `nlp` (spaCy on port 8000), `speech-api`+`speech-worker` (Faster-Whisper + Redis queue, port 8001), `redis`, `postgres`, `caddy`.

## Cross-service contract: `@langphy/shared`

Every TypeScript service depends on `@langphy/shared` (`"file:../../shared"` in its `package.json`). It exports:

- **`TOPICS`** — single source of truth for Kafka topic names (`shared/events/topics.ts`). Always import this constant, never hardcode topic strings.
- **Zod event schemas + inferred TypeScript types** in `shared/events/<domain>/<event>.v1.schema.ts`. Envelope shape lives in `BaseEventSchema` (`event_id`, `event_type`, `event_version`, `occurred_at`, `user_id`, `payload`).
- **`createKafkaClient()`** — single KafkaJS factory in `shared/src/kafka/kafka.client.ts`. Reads `KAFKA_BROKER` (and optional `KAFKA_SASL_USERNAME`/`PASSWORD` for Confluent Cloud). Returns a `Kafka` configured with `SERVICE_NAME` as `clientId`.
- **`connectWithRetry(consumer, name)`** — `shared/src/kafka/kafka.utils.ts`. Use this for consumers; loops every 3s with logs.

After editing anything in `shared/src/`, run `npm run build -w shared` — services consume the compiled `dist/`.

## Standard service layout (every TS service)

```
services/<name>/src/
├── index.ts                  # Express bootstrap, mounts routers + errorHandler, starts Kafka
├── controllers/              # one file per route group (signin, signup, …)
├── routes/                   # Express.Router per group, uses express-validator + validateAuth
├── services/                 # pure functions (email, password hashing, etc.) — auth only
├── models/                   # pg/Mongoose data access; *User model, deleted-users, eventIndex
├── repos/                    # repository layer (deleted-users.repo, etc.)
├── middlewares/
│   ├── error-handler.ts      # catches CustomError, returns { errors: [{message, field?}] }
│   ├── require-auth.ts       # JWT verify, attaches req.user, exports AuthRequest type
│   └── validate-auth.ts      # express-validator result handler
├── errors/                   # custom-errors abstract class + bad-request/conflict/db/no-find/request-validation
├── kafka/
│   ├── kafka.client.ts       # export const kafka = createKafkaClient();
│   ├── producer.ts           # initProducer() + topic-bound publishers (publishUserRegistered, …)
│   └── consumer.ts           # initConsumer() — subscribes via TOPICS, parses with schema, dispatches via handler map
├── db/
│   ├── index.ts              # pgPool (or mongoose connect)
│   ├── migrate.ts            # runs src/db/migrations/*.sql in order, tracks in schema_migrations table
│   └── migrations/           # NNN_*.sql files
└── jobs/                     # cron jobs (notification only)
```

MongoDB-backed services (category/unit/quiz/etc.) drop the `kafka/` and `repos/` folders — they only have `controllers/`, `models/`, `routes/`, `db/`, `index.ts`.

## Patterns to follow

- **Error handling**: throw a custom error subclass (`BadRequestError`, `ConflictError`, `NoFindError`, `RequestValidationError`, `DatabaseConnectionErrors`). The global `errorHandler` middleware handles all of them. Never `res.status(...).json(...)` from a controller — throw.
- **Auth**: `requireAuth` middleware reads `Authorization: Bearer <jwt>`, verifies with `process.env.JWT_KEY`, and types `req` as `AuthRequest` with `req.user = { id, email, created_at }`. All PG services share `JWT_KEY`.
- **Kafka consumers must be idempotent**: check `EventIndexModel.exists(raw.event_id)` and `DeletedUsersRepo.exists(raw.user_id)` **before** parsing/dispatching. Mark processed in a `finally` so failed handlers don't re-deliver forever. Set `autoCommit: false`, commit manually after success.
- **Notification handler map** is the canonical "dispatch by topic" example — see `services/notification/src/application/handle.registry.ts` (`topicHandlerMap: Record<string, NotificationEventHandler<any>>`).
- **Migrations**: every PG service has `node dist/db/migrate.js && node dist/index.js` as its `command` in compose. New migrations = new `NNN_*.sql` file in `src/db/migrations/`.
- **Service port comes from env**: `parseInt(process.env.PORT || "<default>", 10)`. Compose sets per-service defaults (e.g. notification defaults to 4011, gateway to 3009).

## Adding a new event topic

1. Add to `TOPICS` in `shared/events/topics.ts`.
2. Create `<event>.v1.schema.ts` extending `BaseEventSchema` (with literal `event_type` and `event_version: 1`).
3. Re-export from the `<domain>/index.ts` barrel.
4. Producer: import schema + TOPICS, call `kafka.producer.send({ topic, messages: [{ key: user_id, value: JSON.stringify(event) }] })`.
5. Consumer: subscribe to TOPICS constant, parse with schema, add to `topicHandlerMap`.

## Reverse proxy & routing

`infra/caddy/Caddyfile` is the **only place** that maps public paths to services. Every path is `handle /api/<resource>/* { reverse_proxy {$<RESOURCE>_HOST}:{$<RESOURCE>_PORT} }`. Upstream host/port are injected as env vars on Railway. Path prefixes (current routing):

```
/api/users/*      → auth:3000
/api/events*      → gateway-service:3009
/api/streaks/*    → streaks:3001
/api/progress/*   → progress:3002
/api/vocabulary/* → progress:3002
/api/performance/*→ performance:3003
/api/profile/*    → profile:3004
/api/settings/*   → settings:3005
/api/notification/* → notification:4011
/api/category/*   → category:4000
/api/unit/*       → unit:4001
/api/practices/*  → practice:4002
/api/quizzes/*    → quiz:4003
/api/speaking/*   → speaking:4004
/api/reading/*    → reading:4005
/api/writing/*    → writing:4006
/api/listening/*  → listening:4007
/api/nlp/*        → nlp:8000
/api/speech/*     → speech-api:8001 (50MB body cap, 120s timeout)
```

The Caddy image (`infra/caddy/Dockerfile`) bakes the Caddyfile in — do not mount it as a volume on Railway.

## Infrastructure notes

- **Postgres** lives in a single container; `infra/postgres/init.sql` creates the 8 non-auth databases at first boot. `PGDATA` is set to `/var/lib/postgresql/data/pgdata` (subdirectory) so Railway's empty volume doesn't conflict with `lost+found`.
- **Kafka** runs externally (Confluent Cloud / Upstash). Env: `KAFKA_BROKER`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`. No in-cluster broker.
- **Redis** is shared, used only by the speech service for the job queue.
- **MongoDB Atlas** is external; each Mongo service reads `MONGO_URI` and uses `<NAME>_MONGO_URI` env per compose entry.

## Known gotchas

- `shared` must be built (`npm run build -w shared`) before any TS service can `import "@langphy/shared"`. The build emits ESM to `shared/dist/`.
- Many services still have `"@types/express": "^5.0.6"` in `devDependencies` while using Express v4 — when type errors appear, downgrade to `^4.17.21`.
- Some services list `zod` in `devDependencies` despite runtime use (profile, settings) — promote to `dependencies` if a service won't start.
- `node-cron` v4 removed the default export — notification uses the named `schedule` import.
- `JWT_KEY` is shared across services; rotate per env, never commit a real secret. `.env` is gitignored.
- Compose YAML contains a large commented-out legacy section — only the **top** of the file (lines 1–320) is the live config.
- Caddyfile likewise has stacked legacy versions — only the top block (lines 1–121) is active.