# Langphy Backend — Full Architecture Picture
## Current (Kubernetes) → Production (Railway + Docker Compose)

---

## Complete Service Inventory

| Service | Image | Port | DB | Kafka |
|---|---|---|---|---|
| auth | niloyrudra/auth | 3000 | PostgreSQL langphy_auth | ✅ producer |
| streaks | niloyrudra/streaks | 3001 | PostgreSQL langphy_streaks | ✅ consumer (session.completed) |
| progress | niloyrudra/progress | 3002 | PostgreSQL langphy_progress | ✅ consumer (lesson.completed) |
| performance | niloyrudra/performance | 3003 | PostgreSQL langphy_performance | ❌ |
| profile | niloyrudra/profile | 3004 | PostgreSQL langphy_profile | ✅ consumer (user.registered) |
| settings | niloyrudra/settings | 3005 | PostgreSQL langphy_settings | ✅ consumer |
| achievements | niloyrudra/achievements | 3006 | PostgreSQL langphy_achievements | ✅ consumer |
| notification | niloyrudra/notification | 4011 | PostgreSQL langphy_notification | ✅ consumer |
| gateway | niloyrudra/gateway-service | 3009 | PostgreSQL langphy_gateway | ✅ producer |
| category | niloyrudra/category | 4000 | MongoDB Atlas | ❌ |
| unit | niloyrudra/unit | 4001 | MongoDB Atlas | ❌ |
| practice | niloyrudra/practice | 4002 | MongoDB Atlas | ❌ |
| quiz | niloyrudra/quiz | 4003 | MongoDB Atlas | ❌ |
| speaking | niloyrudra/speaking | 4004 | MongoDB Atlas | ❌ |
| reading | niloyrudra/reading | 4005 | MongoDB Atlas | ❌ |
| writing | niloyrudra/writing | 4006 | MongoDB Atlas | ❌ |
| listening | niloyrudra/listening | 4007 | MongoDB Atlas | ❌ |
| nlp-service | niloyrudra/nlp-service | 8000 | — (spaCy, stateless) | ❌ |
| speech-api | niloyrudra/speech-service | 8001 | Redis (job queue) | ❌ |
| speech-worker | niloyrudra/speech-service | — | Redis (job queue) | ❌ |

**Total: 19 containers (20 including Redis itself)**

---

## Repo Structure

```
langphy-backend/
├── package.json                    ← workspace root (if using npm workspaces)
├── package-lock.json
├── shared/                         ← @langphy/shared package
│   ├── package.json
│   ├── src/
│   └── dist/
├── services/
│   ├── auth/
│   │   ├── Dockerfile              ← copy Dockerfile.auth here
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       └── db/
│   │           └── migrations/     ← SQL files read at runtime
│   ├── streaks/                    ← same structure
│   ├── progress/
│   ├── performance/
│   ├── profile/
│   ├── settings/
│   ├── achievements/
│   ├── notification/
│   ├── gateway/
│   ├── category/                   ← MongoDB services (no migrations)
│   ├── unit/
│   ├── practice/
│   ├── quiz/
│   ├── speaking/
│   ├── reading/
│   ├── writing/
│   ├── listening/
│   ├── nlp-service/
│   │   ├── Dockerfile              ← copy Dockerfile.nlp here
│   │   ├── requirements.txt
│   │   └── app/
│   └── speech-service/
│       ├── Dockerfile              ← already have this (speech-specific)
│       ├── requirements.txt
│       └── app/
└── infra/
    ├── postgres/
    │   └── init.sql                ← creates all 9 databases at first boot
    └── caddy/
        └── Caddyfile               ← reverse proxy routing all /api/* paths
```

---

## Infrastructure Changes: K8s → Docker Compose

| K8s Component | Docker Compose Equivalent |
|---|---|
| 9 × PostgreSQL pods + PVCs | 1 × postgres container + `init.sql` creates 9 DBs |
| Kafka + Zookeeper pods | Upstash Kafka (external SaaS, free tier) |
| Redis pod | redis container (Railway volume) |
| MongoDB pods × 8 | MongoDB Atlas (already external, unchanged) |
| nginx Ingress + ingress-srv.yaml | Caddy container (Caddyfile) |
| K8s Secrets | Railway environment variables / .env file |
| PVCs (audio-pvc, whisper-model-cache-pvc) | Docker named volumes |
| initContainers (db-migrate) | `command: sh -c "node dist/db/migrate.js && node dist/index.js"` |

---

## Service Name Changes (update any hardcoded references)

| Old K8s name | New Docker Compose name |
|---|---|
| `kafka-srv:9092` | `$UPSTASH_KAFKA_BROKER` (env var, external) |
| `auth-postgres-srv:5432` | `postgres:5432` |
| `streaks-postgres-srv:5432` | `postgres:5432` |
| `progress-postgres-srv:5432` | `postgres:5432` |
| *(all *-postgres-srv)* | `postgres:5432` |
| `redis` (K8s service) | `redis` (same name ✅) |
| `nlp-srv:8000` | `nlp:8000` |
| `speech-api-srv:8001` | `speech-api:8001` |
| `auth-srv:3000` | `auth:3000` |
| `streaks-srv:3001` | `streaks:3001` |
| `progress-srv:3002` | `progress:3002` |
| `gateway-srv:3009` | `gateway:3009` |
| *(all *-srv)* | service name without -srv suffix |

---

## Known Issues to Fix Before Deploy

### 1. `@types/express` version conflict (CRITICAL)
All services have `"@types/express": "^5.0.6"` but use Express v4.
Fix in each service `package.json`:
```json
"@types/express": "^4.17.21"
```

### 2. `zod` in devDependencies (profile, settings)
Zod is used at runtime but listed as devDep. Move to dependencies:
```json
"dependencies": {
  "zod": "^3.22.4"   // use v3, not v4 — v4 has breaking changes
}
```

### 3. `node-cron` v4 API change (notification)
v4 removed the default export. Change import:
```ts
// Old
import cron from 'node-cron';
// New
import { schedule } from 'node-cron';
```

### 4. JWT_KEY must be changed
All services share `supersecretlangphyjwtkey` — generate a real secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. NLP_SERVICE_URL in speech services
Change from `http://nlp-srv:8000` to `http://nlp:8000` (new service name).
Already updated in the provided docker-compose.yml.

---

## Files Provided

| File | Where it goes |
|---|---|
| `docker-compose.yml` | repo root |
| `infra/postgres/init.sql` → `init.sql` | `infra/postgres/init.sql` |
| `infra/caddy/Caddyfile` → `Caddyfile` | `infra/caddy/Caddyfile` |
| `.env.production` | copy to `.env`, fill in secrets |
| `kafka_client_upstash.ts` | replace `kafka.client.ts` in all Kafka services |
| `Dockerfile.auth` | `services/auth/Dockerfile` |
| `Dockerfile.streaks` | `services/streaks/Dockerfile` |
| `Dockerfile.progress` | `services/progress/Dockerfile` |
| `Dockerfile.performance` | `services/performance/Dockerfile` |
| `Dockerfile.profile` | `services/profile/Dockerfile` |
| `Dockerfile.settings` | `services/settings/Dockerfile` |
| `Dockerfile.achievements` | `services/achievements/Dockerfile` |
| `Dockerfile.notification` | `services/notification/Dockerfile` |
| `Dockerfile.gateway` | `services/gateway/Dockerfile` |
| `Dockerfile.category` | `services/category/Dockerfile` |
| `Dockerfile.unit` | `services/unit/Dockerfile` |
| `Dockerfile.practice` | `services/practice/Dockerfile` |
| `Dockerfile.quiz` | `services/quiz/Dockerfile` |
| `Dockerfile.speaking` | `services/speaking/Dockerfile` |
| `Dockerfile.reading` | `services/reading/Dockerfile` |
| `Dockerfile.writing` | `services/writing/Dockerfile` |
| `Dockerfile.listening` | `services/listening/Dockerfile` |
| `Dockerfile.nlp` | `services/nlp-service/Dockerfile` |
| `Dockerfile` (speech, already have) | `services/speech-service/Dockerfile` |
| `build-and-push.sh` | repo root, run to rebuild all images |
| `DEPLOYMENT_GUIDE.md` | read before deploying |

---

## Deploy Order

1. Fix the 5 known issues above
2. Set up Upstash Kafka, copy credentials to `.env`
3. Run `bash build-and-push.sh` to rebuild all images
4. Push repo to GitHub
5. Create Railway project → deploy from GitHub
6. Add all `.env` variables in Railway dashboard
7. Add domain in Railway → update DNS
8. Update Expo app `EXPO_PUBLIC_API_BASE` → rebuild with EAS