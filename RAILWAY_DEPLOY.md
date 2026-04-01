# Langphy Railway Deployment Guide
## Step-by-step from zero to live

---

## Step 1 — Fix Upstash (you signed up for Redis, need Kafka)

1. Go to **upstash.com**
2. In the top navigation click **"Kafka"** — not Redis
3. Click **"Create Cluster"**
4. Choose a region (pick closest to your users — e.g. `eu-west-1` for Europe)
5. After creation, click your cluster → **"Details"** tab
6. You will see:
   - **Bootstrap Endpoint**: `your-cluster.upstash.io:9092`
   - **Username**: shown on the page
   - **Password**: shown on the page
7. Copy these three values into your `.env`:
   ```
   UPSTASH_KAFKA_BROKER=your-cluster.upstash.io:9092
   UPSTASH_KAFKA_USERNAME=xxx
   UPSTASH_KAFKA_PASSWORD=xxx
   ```
8. Create these topics (click "Topics" → "Create Topic"):
   - `user.registered.v1`
   - `session.completed`
   - `streak.updated`
   - `progress.updated`
   - `lesson.completed`
   - `user.deleted`

Your existing KafkaJS code works with Upstash unchanged —
no new SDK, no `@upstash/kafka`, no `@upstash/redis`.
The `kafka_client_upstash.ts` file provided uses standard KafkaJS
with SASL/SCRAM-SHA-256 + SSL which is exactly what Upstash Kafka uses.

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

## Step 3 — Update kafka.client.ts in all Kafka services

Replace `kafka.client.ts` in these services with `kafka_client_upstash.ts`:
**auth, streaks, progress, profile, settings, achievements, notification, gateway**

This adds SASL/SSL support. Local dev still works unchanged
(SASL is only enabled when KAFKA_SASL_USERNAME env var is set).

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
3. Railway auto-detects `docker-compose.yml`
4. Go to **Variables** tab → add ALL variables from `.env.production`
5. Click **Deploy**

### Option B — Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

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

Set these in Railway's service settings per service:

| Service | RAM | CPU |
|---|---|---|
| nlp | 2 GB | 2 vCPU |
| speech-api | 2 GB | 2 vCPU |
| speech-worker | 4 GB | 4 vCPU |
| postgres | 1 GB | 1 vCPU |
| auth, streaks, progress, etc. | 512 MB | 0.5 vCPU |
| category, unit, practice, etc. | 256 MB | 0.25 vCPU |

Higher CPU for speech-worker directly reduces Whisper transcription time.
Higher RAM for nlp prevents spaCy from OOM-crashing on large texts.

---

## Security Checklist

- [ ] Generate new JWT_KEY (never use `supersecretlangphyjwtkey` in production)
- [ ] Generate strong PG_PASSWORD
- [ ] Add `.env` to `.gitignore` before pushing to GitHub
- [ ] Rotate RESEND_API_KEY after launch (the one in secrets.yaml is exposed)
- [ ] Set MongoDB Atlas IP whitelist (add `0.0.0.0/0` temporarily, restrict later)
- [ ] Enable Railway spending limits to cap unexpected cost overruns
