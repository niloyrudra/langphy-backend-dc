# Langphy — Run Locally (pre-deploy gate)

> Purpose: run the **entire** backend stack on your machine with the **same
> configuration as Railway** (same images-as-source, same KRaft Kafka, same
> health checks) so you can validate everything before `build-and-push.sh`
> and deploy. `scripts/preflight.sh` is the gate: **green locally → deploy.**

---

## 1. Prerequisites

| Tool | Why | Notes |
|---|---|---|
| Docker Desktop (Windows) | run the compose stack | WSL2 backend recommended; needs ~8 GB free RAM |
| bash (Git-Bash or WSL) | `scripts/*.sh` | same shell the repo's build script uses |
| ~10 GB free disk | images (speech ~1.5 GB, node builds) | |
| `.env.local` filled in | env vars for local services | see §3 |

---

## 2. The two local modes

| File | PostgreSQL | Kafka | Mongo | When to use |
|---|---|---|---|---|
| `docker-compose.local.yml` | local `postgres:15` container | **KRaft `apache/kafka:3.7.2`** ✅ prod-parity | local `mongo:7` | default — everything offline |
| `docker-compose.neon.yml` | your **Neon** URLs (from `.env.local`) | **KRaft `apache/kafka:3.7.2`** ✅ prod-parity | local `mongo:7` | when you want to test against the real Neon DBs |

Both now use the exact **single-node KRaft** broker the production
`docker-compose.yml` uses (no ZooKeeper) — so topic behaviour, auto-create
and retention are identical to Railway.

---

## 3. One-time prep

```bash
# 1) Copy + audit the env file (values match what Railway uses)
cp .env.local .env.local.bak      # already exists in-repo; just review it
#   Required keys: JWT_KEY (64 hex!), PG_PASSWORD, MONGO_URI, RESEND_API_KEY,
#   *_POSTGRES_DATABASE_URL, WHISPER_* (speech build args)

# 2) First build is heavy (all 21 images + Whisper model bake). Grab a coffee:
bash scripts/preflight.sh
```

> ⚠ `JWT_KEY` must be exactly 64 hex chars or the **auth** service refuses to boot.

---

## 4. Everyday commands

```bash
# Full round-trip: build + start + verify every service (THE gate)
bash scripts/preflight.sh

# …or with the Neon variant:
bash scripts/preflight.sh docker-compose.neon.yml .env.local

# Manual control
docker compose -f docker-compose.local.yml --env-file .env.local up -d --build   # start
docker compose -f docker-compose.local.yml --env-file .env.local ps              # status
docker compose -f docker-compose.local.yml --env-file .env.local logs -f auth    # logs
docker compose -f docker-compose.local.yml --env-file .env.local down            # stop (keeps volumes)
docker compose -f docker-compose.local.yml --env-file .env.local down -v         # stop + wipe data

# Rebuild after editing one service only
docker compose -f docker-compose.local.yml --env-file .env.local build auth
docker compose -f docker-compose.local.yml --env-file .env.local up -d auth
```

Public surface (through Caddy at `http://localhost`):
`/api/users/*` auth · `/api/events*` gateway · `/api/streaks/*` ·
`/api/progress/*` + `/api/vocabulary/*` · `/api/performance/*` ·
`/api/profile/*` · `/api/settings/*` · `/api/notification/*` ·
`/api/category*` · `/api/unit*` · `/api/practices*` · `/api/quizzes*` ·
`/api/speaking*` · `/api/reading*` · `/api/writing*` · `/api/listening*` ·
`/api/nlp/*` · `/api/speech/*` · `/health`

---

## 5. What preflight.sh verifies

It runs the **same healthcheck endpoints `docker-compose.yml` uses** on Railway:

- 16 × HTTP through Caddy (`/api/users/db`, `/api/*/db`, `/api/*/version`, …)
- streaks `/health` in-container
- `redis-cli ping`
- Kafka broker API versions + auto-created topics
- nlp + speech-api `/health/ready` (python-urllib, as compose does)
- speech-worker process alive

Watch: `docker compose -f docker-compose.local.yml --env-file .env.local ps --format json | python -m json.tool`

---

## 6. Deploy gate checklist (local → Railway)

- [ ] `bash scripts/preflight.sh` → ✅ PASSED
- [ ] Trigger the auth flow once if you changed it: `curl -X POST localhost/api/users/signup …`
- [ ] Confirm Kafka auto-created while events flowed (a signup/session emits them)
- [ ] `bash build-and-push.sh` (rebuild + push all `niloyrudra/*` images)
- [ ] Deploy to Railway (see `RAILWAY_DEPLOY.md` — Kafka is now also KRaft in-project)
- [ ] After deploy: hit `https://api.langphy.com/api/category/version` etc. (§7 of that doc)

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `port 80 is already in use` (Windows) | another process owns 80 → free it, or map Caddy to `8080:80` in the compose and set `CADDY_URL=http://localhost:8080` |
| auth crashes: `JWT_KEY … exactly 64 hex` | generate `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` → put in `.env.local` |
| auth crashes: `KAFKA_BROKER is not set` | `.env.local` needs `KAFKA_BROKER=kafka:9092` (compose default) |
| consumers never connect (TLS/SASL errors) | `KAFKA_SASL_*` must be **EMPTY** in `.env.local` (the local broker is plaintext). Fixed end-to-end: `createKafkaClient` now *ignores placeholder values* (dummy/changeme/…) and logs the connection mode at startup, and `preflight.sh` **fails early** if real SASL creds are set. After pulling the fix, rebuild `shared` + service images |
| consumers never connect | wait ~1 min for KRaft first-boot format; check `docker compose logs kafka` |
| `speech` image build is slow/OOM | Docker Desktop memory ≥ 6 GB; `PREFLIGHT_SKIP_SPEECH=1` to bypass once |
| Redis auth errors after restart | rate-limit counters reset; harmless |
| Something 502s through Caddy | that upstream isn't healthy yet → `docker compose ps --status running` |

> KRaft first boot: on an empty `kafka_data` volume the broker auto-formats
> its storage (few seconds). It then auto-creates `__consumer_offsets` and
> any `TOPICS` you publish.