# AGENTS.md — Langphy Backend (Monorepo)

> **Audience**: any AI coding agent (opencode, aider, Claude Code, Cursor, etc.) being dropped into this repo without prior context.
> **Goal**: within ~2 minutes of reading this, you should know the layout, the build order, the cross-service contract, the rules, and the gotchas — enough to make a small, correct change without being puzzled.
> **If you only have time to read one file**: this one. Read a per-service `AGENTS.md` second.

---

## 1. What this repo is

Polyglot, multi-service backend for **Langphy**, a German-language learning app whose client is an **Expo (React Native) app**. It is an **npm workspaces** monorepo with ~17 Node.js/TypeScript Express services plus 2 Python services, sharing infrastructure via Docker Compose. Production target is **Railway**.

The Expo client talks **only** to a Caddy reverse proxy at well-known `/api/*` paths — Caddy fans those out to individual services. Services also talk to each other asynchronously via **Kafka** (Confluent Cloud / Upstash — external, not in-cluster).

---

## 2. Repo layout

```
.
├── package.json              # npm workspaces root
├── tsconfig.base.json        # maps @shared/* -> shared/*
├── docker-compose.yml        # full prod stack (live config = top of file, ~lines 1–320)
├── build-and-push.sh         # builds & pushes every service image to Docker Hub
├── DEPLOYMENT_GUIDE.md       # K8s → Compose migration notes
├── RAILWAY_DEPLOY.md         # Railway deploy walkthrough
├── CLAUDE.md                 # Claude Code–specific guidance (same project facts, different framing)
├── AGENTS.md                 # ← this file
├── AGENTS.md.template        # per-service template — copy into each service, fill placeholders
├── shared/                   # @langphy/shared package (zod schemas, Kafka client, TOPICS)
├── services/
│   ├── auth, streaks, progress, performance, profile, settings,
│   │   notification, gateway-service              # Postgres-backed, Kafka producers/consumers
│   ├── category, unit, practice, quiz,
│   │   speaking, reading, writing, listening      # MongoDB Atlas (content)
│   ├── nlp-service                                # Python (spaCy)
│   └── speech-service                             # Python (Faster-Whisper) — one image, two entrypoints
├── infra/
│   ├── postgres/   # Dockerfile + init.sql (creates 8 non-auth databases at first boot)
│   └── caddy/      # Dockerfile + Caddyfile (baked in, not volume-mounted on Railway)
└── templates/      # (currently empty — was a duplicate of AGENTS.md.template; cleaned up)
```

---

## 3. Service map

### Postgres-backed services (one DB each, named `langphy_<service>`)

| Service | Port | DB | Role |
|---|---|---|---|
| auth | 3000 | `langphy_auth` | Signup (OTP), signin, JWT issue, password reset, account delete. **Publishes** `user.registered.v1`, `user.deleted.v1`. Uses Neon as the DB host in prod. |
| streaks | 3001 | `langphy_streaks` | Streak math. **Consumes** `session.completed`. |
| progress | 3002 | `langphy_progress` | Lesson/word progress. **Consumes** `lesson.completed`. |
| performance | 3003 | `langphy_performance` | Analytics. No Kafka. |
| profile | 3004 | `langphy_profiles` | User profile. **Consumes** `user.registered.v1` / `user.deleted.v1`. |
| settings | 3005 | `langphy_settings` | App preferences. **Consumes** user events. |
| notification | 4011 | `langphy_notification` | Push notifications + cron reminders. **Consumes** many topics. |
| gateway-service | 3009 | — (stateless) | Aggregates client-side events. **Producer**. |

### MongoDB-backed services (`<SERVICE>_MONGO_URI`, one DB per service)

`category` (4000), `unit` (4001), `practice` (4002), `quiz` (4003), `speaking` (4004), `reading` (4005), `writing` (4006), `listening` (4007). These hold **content only** — no Kafka, no Postgres, no `repos/` or `kafka/` folders. They are **read-only, near-identical GET services** (only the Mongoose schema differs per resource), each wired in compose with its own `<SERVICE>_MONGO_URI` (currently all set to `${MONGO_URI}`).

**`category` is the reference implementation** for content versioning (env-driven collection pointer + `/version` endpoint + `X-Content-Version` headers) that the offline-capable Expo client relies on. `unit`, `practice`, `quiz`, `speaking`, `reading`, `writing`, and `listening` are near-identical siblings and should be kept in lockstep with it — full pattern in §7.

### AI / infra

- `nlp-service` — Python, spaCy, port 8000.
- `speech-service` — Python, Faster-Whisper. Single image, two compose entrypoints: `speech-api` (HTTP, 8001) and `speech-worker` (Redis queue consumer).
- `redis` — only used by speech-service for the job queue.
- `postgres` — single container, init.sql creates 8 non-auth DBs at first boot.
- `caddy` — reverse proxy; Caddyfile is baked into the image, do not mount as volume.

---

## 4. The cross-service contract: `@langphy/shared`

Every TS service depends on `@langphy/shared` (`"file:../../shared"` in `package.json`). It exports:

- **`TOPICS`** — single source of truth for Kafka topic names (`shared/events/topics.ts`). **Always import this constant; never hardcode topic strings.**
- **Zod event schemas + inferred TS types** in `shared/events/<domain>/<event>.v1.schema.ts`. Envelope = `BaseEventSchema` with `event_id`, `event_type`, `event_version`, `occurred_at`, `user_id`, `payload`.
- **`createKafkaClient()`** — single KafkaJS factory (`shared/src/kafka/kafka.client.ts`). Reads `KAFKA_BROKER` (+ optional `KAFKA_SASL_USERNAME`/`PASSWORD`). Uses `SERVICE_NAME` as `clientId`.
- **`connectWithRetry(consumer, name)`** — `shared/src/kafka/kafka.utils.ts`. Use for consumers; loops every 3s with logs.

**After editing anything in `shared/src/`, run `npm run build -w shared`** — services consume the compiled `shared/dist/`.

### Adding a new event topic

1. Add to `TOPICS` in `shared/events/topics.ts`.
2. Create `<event>.v1.schema.ts` extending `BaseEventSchema` (literal `event_type`, `event_version: 1`).
3. Re-export from `<domain>/index.ts`.
4. Producer: import schema + TOPICS; `kafka.producer.send({ topic, messages: [{ key: user_id, value: JSON.stringify(event) }] })`.
5. Consumer: subscribe via TOPICS, parse with schema, add to `topicHandlerMap`.

---

## 5. Standard TS service layout

```
services/<name>/src/
├── index.ts                  # Express bootstrap, mounts routers + errorHandler, starts Kafka
├── controllers/              # one file per route group
├── routes/                   # Express.Router per group, uses express-validator + validateAuth
├── services/                 # pure functions (email, password hashing, …) — auth only
├── models/                   # pg/Mongoose data access; *User model, deleted-users, eventIndex
├── repos/                    # transactional repositories (deleted-users.repo, …)
├── middlewares/
│   ├── error-handler.ts      # catches CustomError → { errors: [{message, field?}] }
│   ├── require-auth.ts       # JWT verify, attaches req.user, exports AuthRequest type
│   └── validate-auth.ts      # express-validator result handler
├── errors/                   # CustomError abstract + bad-request/conflict/db/no-find/request-validation
├── kafka/
│   ├── kafka.client.ts       # export const kafka = createKafkaClient();
│   ├── producer.ts           # initProducer() + topic-bound publishers
│   └── consumer.ts           # initConsumer() — subscribes via TOPICS, parses with schema, dispatches via handler map
├── db/
│   ├── index.ts              # pgPool (or mongoose connect)
│   ├── migrate.ts            # runs src/db/migrations/*.sql in order, tracks in schema_migrations
│   └── migrations/           # NNN_*.sql — append-only
└── jobs/                     # cron jobs (notification only)
```

Mongo services drop the `kafka/` and `repos/` folders — only `controllers/`, `models/`, `routes/`, `db/`, `index.ts`. `category` additionally has `src/config.ts` (content-version/collection envs) and `src/middlewares/error-handler.ts` — the other content services (unit, practice, quiz, speaking, reading, writing, listening) are near-identical and should mirror `category` when you extend them.

---

## 6. Build & test commands

> ⚠ **Reality check**: as of this writing, **there are no unit or e2e tests implemented in the repo** (the `templates/` folder documents a planned structure but it is empty). Don't waste time looking for them. `services/auth` and `services/profile` have jest + ts-jest installed and **model-level** tests exist in `auth/tests/unit/` and `profile/tests/unit/` — these are the only tested code paths right now. If you add new tests, prefer the model layer; controllers/routes need a DB+Express harness.

```bash
# From repo root
npm run clean && npm install      # clean slate
npm run build -w shared           # MUST run before any TS service build
npm run build                     # builds every PG-backed service
npm run dev                       # = npm run dev -w services/auth  (nodemon hot-reload)
npm run dev -w services/streaks   # dev any single service
npm run build -w services/auth -c # build one service, wipe previous dist

# Per-service (run from services/<name>/)
npm test                          # jest --runInBand (auth + profile only)

# Full stack locally
docker compose up -d
bash build-and-push.sh            # build all images & push to Docker Hub
```

Python services use their own venv / Dockerfile; there is no monorepo Python toolchain configured.

---

## 7. Patterns to follow

- **Error handling**: throw a custom error subclass (`BadRequestError`, `ConflictError`, `NoFindError`, `RequestValidationError`, `DatabaseConnectionErrors`). The global `errorHandler` middleware handles them. **Never** `res.status(...).json(...)` from a controller — throw.
- **Auth**: `requireAuth` reads `Authorization: Bearer <jwt>`, verifies with `process.env.JWT_KEY`, types `req` as `AuthRequest` with `req.user = { id, email, created_at }`. **`JWT_KEY` is shared across all PG services** — rotate per env, never commit a real secret.
- **Kafka consumers must be idempotent**: check `EventIndexModel.exists(raw.event_id)` AND `DeletedUsersRepo.exists(raw.user_id)` **before** parsing/dispatching. Mark processed in a `finally` so failed handlers don't re-deliver forever. Set `autoCommit: false`, commit manually after success.
- **Notification handler map** is the canonical "dispatch by topic" example — `services/notification/src/application/handle.registry.ts` (`topicHandlerMap: Record<string, NotificationEventHandler<any>>`).
- **Migrations**: every PG service runs `node dist/db/migrate.js && node dist/index.js` as its compose `command`. New migrations = new `NNN_*.sql` file in `src/db/migrations/`. **Existing migrations are append-only — never edit a file that's already been applied.**
- **Service port from env**: `parseInt(process.env.PORT || "<default>", 10)`. Compose sets per-service defaults (notification defaults to 4011, gateway to 3009, auth to 3000, …).
- **Content versioning (offline-sync)** — `services/category` is the reference. Two envs drive it, read in `src/config.ts`: `<SERVICE>_COLLECTION` (active collection, default `categories`) and `<SERVICE>_CONTENT_VERSION` (int, default `1`). The Mongoose model sets its `collection` from the env, so **the active collection is the version boundary** — each release lives side-by-side in its own collection (`categories`, `categories_v2`, …) and served data can never mix versions. A **`GET /api/<resource>/version`** endpoint (`{ resource, version }`) plus an **`X-Content-Version`** response header on data routes tells the offline Expo client when its cache is stale. ⚠️ Register `/version` **before** `/:id` or the string-id route swallows it. Release workflow = import new data into a fresh collection, set the two envs, redeploy — no code change.

---

## 8. Reverse proxy / routing

`infra/caddy/Caddyfile` is the **only place** that maps public paths to services. Pattern: `handle /api/<resource>/* { reverse_proxy {$<RESOURCE>_HOST}:{$<RESOURCE>_PORT} }`. Upstream host/port are injected as env vars on Railway.

| Public path | → Service | Port |
|---|---|---|
| `/api/users/*` | auth | 3000 |
| `/api/events*` | gateway-service | 3009 |
| `/api/streaks/*` | streaks | 3001 |
| `/api/progress/*`, `/api/vocabulary/*` | progress | 3002 |
| `/api/performance/*` | performance | 3003 |
| `/api/profile/*` | profile | 3004 |
| `/api/settings/*` | settings | 3005 |
| `/api/notification/*` | notification | 4011 |
| `/api/category/*` | category | 4000 |
| `/api/unit/*` | unit | 4001 |
| `/api/practices/*` | practice | 4002 |
| `/api/quizzes/*` | quiz | 4003 |
| `/api/speaking/*` | speaking | 4004 |
| `/api/reading/*` | reading | 4005 |
| `/api/writing/*` | writing | 4006 |
| `/api/listening/*` | listening | 4007 |
| `/api/nlp/*` | nlp-service | 8000 |
| `/api/speech/*` | speech-api | 8001 (50MB body cap, 120s timeout) |

The Caddy image bakes the Caddyfile in — **do not** mount it as a volume on Railway.

---

## 9. Rules for AI agents working in this repo

1. **Scope edits tightly.** When asked to fix something, touch only that. Don't reformat neighbors, don't drive-by upgrade deps, don't rename files. If you think a refactor is needed, say so and stop — don't do it.
2. **Never change a function's signature or return type** without explicit permission for *that specific* change. If a fix seems to require it, stop and report why.
3. **Cross-service changes need a plan, not a one-shot edit.** Adding a new Kafka topic, changing a schema, renaming a path in the Caddyfile, or adding a new service all touch multiple repos (shared + producer + consumer + routing). Read `AGENTS.md` §4 first.
4. **Tests are not required for trivial edits**, but if you change a model or repo method that already has a test, run it. `cd services/<name> && npm test` (only auth and profile have tests).
5. **Never commit automatically.** Leave changes uncommitted and report what you did.
6. **Report severity honestly.** Use:
   - 🔴 **Critical** — exploitable security issue, data loss, crash on a prod path
   - 🟡 **Warning** — perf issue, fragile error handling, missing validation
   - 🔵 **Info** — style/convention deviation, minor improvement
7. **Use the right tool for the job.** This monorepo has npm workspaces, Docker Compose, Kafka, Postgres, MongoDB, Redis, spaCy, Faster-Whisper. Don't guess — read the relevant code first.

---

## 10. Known gotchas

- **`shared` must be built first** (`npm run build -w shared`) before any TS service can `import "@langphy/shared"`. The build emits ESM to `shared/dist/`.
- **Type-pinning mismatch**: several services list `@types/express ^5.0.6` while using Express v4 — when type errors appear, downgrade to `^4.17.21`. Don't "fix" by upgrading Express.
- **`zod` sometimes in `devDependencies`** despite runtime use (profile, settings) — promote to `dependencies` if the service won't start.
- **`node-cron` v4** removed the default export — notification uses the named `schedule` import.
- **`JWT_KEY` is shared across services** — rotate per env, never commit a real secret. `.env` is gitignored.
- **Compose YAML & Caddyfile have stacked legacy sections** — only the **top** of each file is the live config. Don't edit the commented-out historical versions.
- **Postgres on Railway**: `PGDATA` is set to `/var/lib/postgresql/data/pgdata` (subdirectory) so Railway's empty volume doesn't conflict with `lost+found`. Don't change it.
- **Kafka is external** — no in-cluster broker. Env: `KAFKA_BROKER`, `KAFKA_SASL_*`. Don't try to add a Kafka service to compose.
- **Tsup builds**: if a service fails to build shared artifacts, `npm install -D tsup` at root.
- **`@langphy/auth` specifics** (recently hardened): uses Neon as the Postgres host (`POSTGRES_DATABASE_URL`), has a transactional outbox for Kafka, and security middleware (helmet, express-rate-limit with Redis store, resend for OTP email). Don't regress these.
- **`@langphy/profile` is the reference for model-level tests** — `services/profile/tests/unit/` shows the pattern (helpers in `tests/helpers/`, jest with ts-jest, `tsconfig.test.json`). Copy that shape if you add tests elsewhere.
- **Content versioning exists only in `category` today** — `unit`, `practice`, `quiz`, `speaking`, `reading`, `writing`, `listening` are near-identical to category but do **not** yet have `src/config.ts`, the `<SERVICE>_COLLECTION`/`<SERVICE>_CONTENT_VERSION` envs, a `/version` route, or `X-Content-Version` headers. Mirror `services/category` when you edit them.

---

## 11. Where to start when you don't know where to start

1. **Read this file.** Done.
2. **Read `services/<name>/AGENTS.md`** for the service you'll touch (copy from `AGENTS.md.template` if missing).
3. **Read `shared/events/topics.ts`** to see what events exist.
4. **Skim `docker-compose.yml` (top ~320 lines)** to see which env vars that service expects.
5. **If a test exists in `services/<name>/tests/`, run it before changing anything** — it tells you what the existing behaviour is.
6. **Make the smallest possible change.** Re-read what you wrote. Report.
