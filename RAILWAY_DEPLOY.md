# Langphy Railway Deployment Guide
## Step-by-step from zero to live

---

## Step 1 — Kafka: in-project single-node KRaft (≈ $2–4/mo, no external service)

No Upstash/Confluent subscription. The repo already ships a **single-node
KRaft broker (`apache/kafka:3.7.2`, no ZooKeeper)** in `docker-compose.yml`.
On Railway it becomes one ordinary service on the private network.

### A. Create the Kafka service
1. Create Service → **Deploy service from a Docker Image** → `apache/kafka:3.7.2`
2. Variables (exact list — copy from `docker-compose.yml`):

   | Variable | Value |
   |---|---|
   | `KAFKA_HEAP_OPTS` | `-Xms256m -Xmx256m` (fits 512 MB) |
   | `KAFKA_NODE_ID` | `1` |
   | `KAFKA_PROCESS_ROLES` | `broker,controller` |
   | `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP` | `CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT` |
   | `KAFKA_LISTENERS` | `PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093` |
   | `KAFKA_ADVERTISED_LISTENERS` | `PLAINTEXT://${{kafka.RAILWAY_PRIVATE_DOMAIN}}:9092` |
   | `KAFKA_CONTROLLER_QUORUM_VOTERS` | `1@kafka:9093` |
   | `KAFKA_CONTROLLER_LISTENER_NAMES` | `CONTROLLER` |
   | `KAFKA_LOG_DIRS` | `/var/lib/kafka/data` |
   | `KAFKA_AUTO_CREATE_TOPICS_ENABLE` | `true` |
   | `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR` | `1` |
   | `KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR` | `1` |
   | `KAFKA_TRANSACTION_STATE_LOG_MIN_ISR` | `1` |
   | `KAFKA_LOG_RETENTION_HOURS` | `48` (keeps the volume small) |
   | `KAFKA_LOG_SEGMENT_BYTES` | `1073741824` |

   > If the service ends up named differently (e.g. `kafka-prod`) change the
   > `kafka` in the two reference lines above to match.

3. **Volume**: Settings → Volumes → **Add Volume**, mount path `/var/lib/kafka/data`,
   size **≥ 2 GB** (~$0.30/mo).
4. **Size**: `0.25 vCPU / 512 MB` (the minimum) — the heap tuning above makes this stable.
5. **Serverless**: Settings → Deploy → enable **Serverless**. The broker sleeps after
   ~10 min of full-idle and wakes on the first connection (20–60 s cold start).
   This is what makes Kafka cost **~$2.40/mo instead of ~$10.30/mo**.
   - ✅ Keep ON while traffic is occasional (early launch, dev). Your sync API paths
     never block on Kafka (auth uses the PG outbox; consumers retry), so a sleeping
     bus only delays *async* updates.
   - ⏸ **Flip OFF when** real users keep the bus hot 24/7, or when the first-after-idle
     request may not tolerate +30–60 s. Always-on ≈ **$10.30/mo**.
6. No public domain / TCP proxy — services reach it over the private network only.

### B. Point every Kafka service at it
On **auth, streaks, progress, performance, profile, settings, notification, gateway** add:

```text
KAFKA_BROKER = ${{kafka.RAILWAY_PRIVATE_DOMAIN}}:9092
```

(Or hardcode the literal `xxxx.railway.internal:9092` shown on the Kafka service's
Settings → Networking page.)

### C. Topics
`KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` auto-creates them on first publish —
no manual topic creation (the app uses `user.registered.v1`, `session.completed`,
`lesson.completed`, `streak.updated`, `progress.updated`, `settings.updated.v1`,
`user.deleted.v1`, `notification.created.v1`, `reminder.triggered.v1`, …).

### D. Redis (also in-project)
Create a **Redis** service from `redis:7-alpine` with the same cost treatment:
args `--maxmemory 256mb --maxmemory-policy volatile-lru --appendonly yes`,
Volume on `/data` (1 GB), 0.25 vCPU / 512 MB, Serverless ON.
Then on `auth`: `REDIS_URL = redis://${{redis.RAILWAY_PRIVATE_DOMAIN}}:6379`
and on `speech-api`/`speech-worker`: `REDIS_HOST = ${{redis.RAILWAY_PRIVATE_DOMAIN}}`, `REDIS_PORT = 6379`.

> ❕ Railway treats `docker-compose.yml` as a **translation recipe**, not a runtime
> executor — wire the services individually (image, variables, volume, size) as above.

---

## Step 2 — Repo Structure

```
langphy-backend/
├── docker-compose.yml          ← provided (this session)
├── .env                        ← copy from .env.production, fill values
├── infra/
│   ├── postgres/
│   │   └── init.sql            ← provided (creates all 9 databases)
│   └── caddy/
│       └── Caddyfile           ← provided (replace api.langphy.com)
└── services/
    └── ...all your services...
```

---

## Step 3 — Kafka client: NO changes needed

The shared `kafka.client.ts` already reads `KAFKA_BROKER` (+ optional SASL).
With the in-project KRaft broker, services talk **plain TCP over Railway's
WireGuard private network** — no SASL, no TLS, no code change.

If you later switch to a managed broker, just set `KAFKA_BROKER`,
`KAFKA_SASL_USERNAME` and `KAFKA_SASL_PASSWORD` — the client enables
SASL/PLAIN + SSL automatically when the username is present (verify your
provider accepts PLAIN, or change `mechanism` to `scram-sha-256`).

---

## Step 4 — Build & Push All Images

```bash
# From repo root
bash build-and-push.sh
```

---

## Step 5 — Deploy on Railway

### Option A — GitHub (recommended)
1. Push repo to GitHub (make sure `.env` is in `.gitignore`)
2. railway.com → New Project → Deploy from GitHub repo
3. Railway uses `docker-compose.yml` as a **wiring recipe** — create each service
   from its image/Dockerfile and set variables per the tables in these docs
   (it does not execute the compose file at runtime)
4. Go to **Variables** tab → add ALL variables from `.env.local` (or `.env.example`)
5. Click **Deploy**

### Option B — Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## Step 5B — Service-by-service quick reference

Every service is created from its image or Dockerfile. The column **Start
command** replaces the image default where needed; **Healthcheck** is the URL
you put in Railway's healthcheck settings (Settings → Deploy → Healthcheck path).

| Service | Image | Port | Start command | Healthcheck |
|---|---|---|---|---|
| auth | `niloyrudra/auth` | 3000 | `sh -c "node dist/db/migrate.js && node dist/index.js"` | `/api/users/db` |
| streaks | `niloyrudra/streaks` | 3001 | same migrate+start pattern | `/health` |
| progress | `niloyrudra/progress` | 3002 | ″ | `/api/progress/db` |
| performance | `niloyrudra/performance` | 3003 | ″ | `/api/performance/db` |
| profile | `niloyrudra/profile` | 3004 | ″ | `/api/profile/db` |
| settings | `niloyrudra/settings` | 3005 | ″ | `/api/settings/db` |
| notification | `niloyrudra/notification` | 4011 | ″ | `/api/notification/db` |
| gateway | `niloyrudra/gateway-service` | 3009 | ″ | `/api/gateway/db` |
| category | `niloyrudra/category` | 4000 | *(image default)* | `/api/category/version` |
| unit | `niloyrudra/unit` | 4001 | – | `/api/unit/version` |
| practice | `niloyrudra/practice` | 4002 | – | `/api/practices/version` |
| quiz | `niloyrudra/quiz` | 4003 | – | `/api/quizzes/version` |
| speaking | `niloyrudra/speaking` | 4004 | – | `/api/speaking/version` |
| reading | `niloyrudra/reading` | 4005 | – | `/api/reading/version` |
| writing | `niloyrudra/writing` | 4006 | – | `/api/writing/version` |
| listening | `niloyrudra/listening` | 4007 | – | `/api/listening/version` |
| nlp | `niloyrudra/nlp-service` | 8000 | *(image default)* | `/health/ready` |
| speech-api | `niloyrudra/speech-service` | 8001 | `uvicorn app.main:app --host 0.0.0.0 --port 8001` | `/health/ready` |
| speech-worker | `niloyrudra/speech-service` | — | `python app/worker.py` | *(none — process-based)* |
| kafka | `apache/kafka:3.7.2` | 9092 | *(image default)* | *(none — see Step 1)* |
| redis | `redis:7-alpine` | 6379 | `redis-server --maxmemory 256mb --maxmemory-policy volatile-lru --appendonly yes` | `redis-cli ping` |
| caddy | `niloyrudra/caddy` | 80 | `caddy run --config /etc/caddy/Caddyfile` | `/health` |

Per-service variables (✱ = from your secrets file): **all** services get
`*_HOST`/`*_PORT` pairs only on **caddy**; Kafka consumers/producers get
`KAFKA_BROKER=${{kafka.RAILWAY_PRIVATE_DOMAIN}}:9092`; PG services get
`SERVICE_NAME=<svc>-service`, `PG_DB=langphy_<svc>`,
`POSTGRES_DATABASE_URL` ✱ (each its own `<SVC>_POSTGRES_DATABASE_URL`); content
services get `<SVC>_MONGO_URI=${{...}}` or literal Atlas ✱, `<SVC>_COLLECTION`,
`<SVC>_CONTENT_VERSION`; auth gets `REDIS_URL`, `RESEND_API_KEY` ✱, `FROM_EMAIL` ✱,
`GOOGLE_*` ✱, `FACEBOOK_*` ✱, `CORS_ORIGIN`; speech gets `REDIS_HOST/PORT`,
`NLP_SERVICE_URL`, `WHISPER_*`, `HF_HOME`, `INTERNAL_SERVICE_TOKEN` ✱; nlp gets
`INTERNAL_SERVICE_TOKEN` ✱. Copy values from `.env.example` and `docker-compose.yml`.

---

## Step 6 — Configure Domain

1. Railway dashboard → your project → **Settings** → **Domains**
2. Add custom domain: `api.langphy.com`
3. Copy the CNAME value Railway gives you
4. In your DNS provider (Hostinger): add CNAME record
   - Name: `api`
   - Value: the Railway CNAME
5. Wait 5-10 minutes for DNS propagation
6. Caddy automatically gets a TLS certificate — no manual cert setup

---

## Step 7 — Update Expo App

In your Expo app `.env`:
```
EXPO_PUBLIC_API_BASE=https://api.langphy.com/api
```

Rebuild with EAS:
```bash
eas build --platform android --profile production
```

---

## Railway Resource Recommendations

Baseline (unless metrics say otherwise). Serverless ON for everything below
that may sit idle — the subscription fee covers the first dollars of usage.

| Service | RAM | CPU | Serverless | Notes |
|---|---|---|---|---|
| kafka (KRaft) | 512 MB | 0.25 vCPU | ✅ ON (~$2.4/mo) | flip OFF = ~$10.3/mo, see Step 1 |
| redis | 512 MB | 0.25 vCPU | ✅ ON | `volatile-lru`, volume /data |
| nlp | 2 GB | 2 vCPU | OFF | spaCy, keep warm |
| speech-api | 2 GB | 2 vCPU | OFF | Whisper w/ warm-up |
| speech-worker | 4 GB | 4 vCPU | OFF | Whisper transcription |
| auth, streaks, progress, etc. | 512 MB | 0.25 vCPU | ✅ ON | Node services |
| category, unit, practice, etc. | 256 MB | 0.25 vCPU | ✅ ON | content, read-only |
| caddy | 256 MB | 0.25 vCPU | ✅ ON | `auto_https off`, edge TLS terminates |

> Postgres is **Neon** (managed) — no Railway container for it. Only relevant
> if you later choose to self-host Postgres on Railway: 1 GB / 1 vCPU + volume.

Higher CPU for speech-worker directly reduces Whisper transcription time.
Higher RAM for nlp prevents spaCy from OOM-crashing on large texts.

---

## Security Checklist

- [ ] Generate new JWT_KEY (never use `supersecretlangphyjwtkey` in production)
- [ ] Generate strong PG_PASSWORD
- [ ] Add `.env` to `.gitignore` before pushing to GitHub
- [ ] No Kafka credentials needed (KRaft lives on the private network) — if you
      do use a managed broker later, treat `KAFKA_SASL_*` as secrets
- [ ] Rotate RESEND_API_KEY after launch (the one in secrets.yaml is exposed)
- [ ] Set MongoDB Atlas IP whitelist (add `0.0.0.0/0` temporarily, restrict later)
- [ ] Set a Railway usage **hard limit** (e.g. $50) + email alert — `Settings →
      Usage`, then verify the Serverless toggle per service actually sleeps
- [ ] Enable Railway spending limits to cap unexpected cost overruns
