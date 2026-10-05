# Langphy on Kubernetes — Deployment Guide

> Companion to this repo's `docker-compose.yml`. Everything you need to run the
> Langphy backend on a Kubernetes cluster (AWS EKS, GCP GKE, or local kind/k3s).
> Cloud-agnostic `kubectl` manifests live in [`k8s/`](k8s/).

---

## 1. Architecture at a glance

```
                        ┌─────────────────────────────────────────────┐
   Expo (React Native)  │              api.langphy.com                 │
        │ HTTPS         │  (DNS → cloud LB / Ingress controller)      │
        ▼               └──────────────────┬──────────────────────────┘
                                   │ 80 (TLS terminated at edge,
                                   │    forwarded as HTTP)
                                   ▼
                        ┌─────────────────────────────────────────────┐
                        │  Caddy  (niloyrudra/caddy)  :80              │
                        │  path-based routing → 19 upstream Services   │
                        └──────┬─────┬──────┬─────┬─────┬─────────────┘
                               │     │      │     │     │
        ┌──────────────────────▼─┐ ┌─▼──────▼─┐ ┌─▼───┐ ┌─▼────────────┐
        │ 8× PG Node services   │ │ 8× Mongo │ │ NLP │ │ Speech       │
        │ auth, streaks, ...    │ │ content  │ │ 8000│ │ api+worker   │
        │ gateway (3009)        │ │ services │ │     │ │ (8001, RQ)   │
        └──────┬────────────────┘ └────┬──────┘ └─────┘ └──────┬───────┘
               │ per-service URL       │                        │
        ┌──────▼───────────────┐ ┌─────▼────────┐        ┌──────▼───────┐
        │ PostgreSQL — Neon     │ │ MongoDB —    │        │ Redis (K8s)  │
        │ (managed, external)   │ │ Atlas (ext.) │        │ :6379 state. │
        └──────────────────────┘ └──────────────┘        └──────────────┘
        ┌─────────────────────────────────────────────┐
        │ Kafka — MANAGED (Upstash/Confluent, SASL)    │  ← external
        │ (optional in-cluster single-node KRaft in   │
        │  k8s/10-infra/kafka-kraft.example.yaml)      │
        └─────────────────────────────────────────────┘
```

**What runs in the cluster** – 20 containers: 19 services + Caddy + Redis
(Redis is the *only* persistent thing we host; PostgreSQL, MongoDB and Kafka
stay managed/external).

| Service | Image (Docker Hub) | Port | State |
|---|---|---|---|
| auth | `niloyrudra/auth` | 3000 | Neon `langphy_auth` · Kafka producer · Redis rate-limit |
| streaks | `niloyrudra/streaks` | 3001 | Neon `langphy_streaks` · Kafka consumer |
| progress | `niloyrudra/progress` | 3002 | Neon `langphy_progress` · Kafka consumer |
| performance | `niloyrudra/performance` | 3003 | Neon `langphy_performance` |
| profile | `niloyrudra/profile` | 3004 | Neon `langphy_profile` · Kafka consumer |
| settings | `niloyrudra/settings` | 3005 | Neon `langphy_settings` · Kafka consumer |
| notification | `niloyrudra/notification` | 4011 | Neon `langphy_notification` · Kafka · **cron inside API → keep replicas=1** |
| gateway-service | `niloyrudra/gateway-service` | 3009 | Neon `langphy_gateway` · Kafka producer |
| category/unit/practice/quiz/speaking/reading/writing/listening | `niloyrudra/<svc>` | 4000–4007 | MongoDB Atlas (content, read-only) |
| nlp-service | `niloyrudra/nlp-service` | 8000 | stateless · spaCy |
| speech-api | `niloyrudra/speech-service` | 8001 | Redis RQ (enqueue) · Whisper |
| speech-worker | `niloyrudra/speech-service` | — | Redis RQ (consume) · Whisper |
| caddy | `niloyrudra/caddy` | 80 | reverse proxy (stateless, `persist_config off`) |
| redis | `redis:7-alpine` | 6379 | **in-cluster Stateful Deployment + PVC** |

## 2. What you need before starting

| # | Item | Where |
|---|---|---|
| 1 | A Kubernetes cluster (≥ 1.32) — EKS, GKE, or local kind/k3s | cloud console / provider docs (§8–§10) |
| 2 | `kubectl` ≥ 1.32 on your machine | https://kubernetes.io/releases/download/ |
| 3 | Docker Hub access to `niloyrudra/*` images (or mirror them to ECR/GCR) | `build-and-push.sh` builds them |
| 4 | **Neon** PostgreSQL — 8 databases (or 1 server + 8 DBs), one URL per service | `*.POSTGRES_DATABASE_URL` values |
| 5 | **MongoDB Atlas** — cluster with the `Langphy-DE` content DBs, IP allow-list set | `MONGO_URI` value |
| 6 | **Managed Kafka** (Upstash/Confluent/Aiven) with SASL credentials | `KAFKA_BROKER`, `KAFKA_SASL_USERNAME/PASSWORD` |
| 7 | Domain DNS control — `api.langphy.com` A/ALIAS → your LB/ingress IP | DNS provider |
| 8 | (Optional) Ingress controller / cert manager — ingress-nginx, AWS ALB, GCP ingress | §8–§10 |

> **Kubernetes version note:** manifests in `k8s/` use the modern *stateful
> Deployment* API (`spec.template`, `containers`, probes, PVCs) which is GA
> since Kubernetes 1.32. On older clusters you will get a schema error from
> `kubectl apply` — upgrade the cluster or the manifests.

---

## 3. `k8s/` layout

```
k8s/
├── apply.sh                        # one-command deploy (recommended)
├── 00-namespace.yaml               # namespace "langphy"
├── 01-secrets.example.yaml         # ← copy to 01-secrets.yaml + fill (gitignored)
├── 02-config.yaml                  # ConfigMap with non-secret shared env
├── 10-infra/
│   ├── redis.yaml                  # stateful Redis (Deployment + PVC + Service)
│   └── kafka-kraft.example.yaml    # OPTIONAL in-cluster Kafka (off by default)
├── 20-proxy/
│   └── caddy.yaml                  # Caddy reverse proxy (Deployment + Service :80)
├── 30-services/                    # one file per service (Deployment + Service)
│   ├── auth.yaml  streaks.yaml  progress.yaml  performance.yaml  profile.yaml
│   ├── settings.yaml  notification.yaml  gateway.yaml
│   ├── category.yaml  unit.yaml  practice.yaml  quiz.yaml
│   ├── speaking.yaml  reading.yaml  writing.yaml  listening.yaml
│   └── nlp.yaml  speech-api.yaml  speech-worker.yaml
└── 40-ingress/
    └── ingress.yaml                # OPTIONAL ingress-nginx example (see §6)
```

---

## 4. Secrets — the full env inventory

**In the `langphy-secrets` Secret** (via `envFrom`, available to every pod):

`JWT_KEY`, `INTERNAL_SERVICE_TOKEN`, `AUTH|STREAKS|PROGRESS|PERFORMANCE|PROFILE|SETTINGS|NOTIFICATION|GATEWAY_POSTGRES_DATABASE_URL`,
`PG_PASSWORD`, `KAFKA_BROKER`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`,
`MONGO_URI`, `RESEND_API_KEY`, `FROM_EMAIL`, `GOOGLE_WEB_CLIENT_ID`,
`GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `FACEBOOK_APP_ID`,
`FACEBOOK_APP_SECRET`, `HF_TOKEN`

**In the `langphy-config` ConfigMap** (via `envFrom`, every pod):
`NODE_ENV`, `TZ`, `CORS_ORIGIN`, `KAFKAJS_NO_PARTITIONER_WARNING`,
`REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `NLP_SERVICE_URL`, `HF_HOME`,
`WHISPER_MODEL_SIZE`, `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE`, `WHISPER_NUM_WORKERS`

**Per-service `env:`** (defined in each `30-services/*.yaml`):

| Service | env |
|---|---|
| all PG services | `SERVICE_NAME`, `PG_DB`, `PORT`, `POSTGRES_DATABASE_URL` ← `<SVC>_POSTGRES_DATABASE_URL` |
| content services | `<SVC>_MONGO_URI` ← `MONGO_URI`, `<SVC>_COLLECTION`, `<SVC>_CONTENT_VERSION`, `PORT` |
| nlp | `PORT=8000` |
| speech-api / speech-worker | `PORT` (api only), `REDIS_HOST/PORT`, `NLP_SERVICE_URL`, `WHISPER_*`, `HF_HOME` |
| caddy | `PORT=80` + `${SVC}_HOST` / `${SVC}_PORT` for all 19 upstreams |

---

## 5. Deploying — step by step

```bash
# 1) Create the secrets file (gitignored, never committed)
cp k8s/01-secrets.example.yaml k8s/01-secrets.yaml
#    ... edit k8s/01-secrets.yaml with real values (Railway/.env parity) ...

# 2) OPTIONAL sanity check BEFORE touching the cluster (server-side dry-run)
kubectl apply --dry-run=server -f k8s/00-namespace.yaml -f k8s/02-config.yaml
#    (services reference the Secret/ConfigMap by name, so they dry-run best
#     after secrets exist — the script below applies in the correct order)

# 3) Deploy everything
bash k8s/apply.sh

# 4) Watch pods come up
kubectl -n langphy get deployments
kubectl -n langphy get pods -o wide

# 5) Follow one rollout
kubectl -n langphy rollout status deployment/auth --timeout=300s
```

Services boot in their Railway order: **migrate → connect Kafka → connect Neon/Atlas → listen**. The
`startupProbe` gives each pod up to ~10 minutes to finish (migrations + Kafka connect); once it
succeeds, the `livenessProbe` takes over. A pod that fails startup is restarted — exactly like
compose `restart: unless-stopped`.

---

## 6. Exposing traffic (TLS, DNS, Ingress)

Two clean, cloud-agnostic options — **pick one**:

### Option A — Kubernetes Ingress + keep Caddy (recommended)
```
api.langphy.com  →  cloud LB / ingress controller (TLS)  →  Service "caddy":80
```
- TLS is terminated at the edge (cert-manager + Let's Encrypt, AWS ALB, or GCP LB cert).
- Traffic arrives at Caddy as plain HTTP — the baked Caddyfile already has `auto_https off`. ✔ no image rebuild
- The example in `k8s/40-ingress/ingress.yaml` is a starting point; align `tls` annotation
  and certificate provisioning with **your** ingress controller (all controllers differ — AWS ALB vs
  ingress-nginx vs GCE). `k8s/40-ingress` is deliberately NOT applied by `apply.sh`.

### Option B — Ingress does the path routing, drop Caddy
Replace the 20 `handle` blocks of the Caddyfile with `rules[].http.paths[].path` entries. You
lose the exact wildcard matching (`/api/category*` vs `/api/category/*`) and the per-route
timeouts/body-size limits (`/api/nlp/*` 30s / 1MB, `/api/speech/*` 120s / 12MB) unless you
re-create them with controller annotations. **Not recommended** — keep Caddy.

After either option:
```bash
kubectl -n langphy get ingress langphy-api          # get the LB IP/host
# DNS:  api.langphy.com  →  A/ALIAS  (or CNAME)  →  that IP/host
curl -s https://api.langphy.com/api/category/version   # expect {"resource":"category",...}
curl -s https://api.langphy.com/health                 # Caddy → "OK" 200
```

No Expo rebuild is needed if the domain stays `api.langphy.com` (`EXPO_PUBLIC_API_BASE`
unchanged).

---

## 7. After deploy — health verification cheat-sheet

| Check | Command |
|---|---|
| All pods Running | `kubectl -n langphy get pods` |
| Caddy routes | `curl -s http://<pod-ip>/health` |
| Auth | `curl -s https://api.langphy.com/api/users/db` |
| Streaks | `curl -s https://api.langphy.com/api/streaks/db-ish` (see service health paths in §1) |
| Kafka consumers connected | `kubectl -n langphy logs deploy/streaks --tail=50 \| grep -i kafka` |
| NLP | `curl -s https://api.langphy.com/api/nlp/health/ready` (via Caddy) |
| Redis | `kubectl -n langphy exec deploy/redis -- redis-cli ping` |
| Speech round-trip | POST `/api/speech/evaluate` (audio) → poll `/api/speech/result/{job_id}` |

---

## 8. Deploying on AWS (EKS)

```bash
# 1) Create the cluster (eksctl)
eksctl create cluster \
  --name langphy-prod \
  --region eu-west-1 \
  --nodegroup-name standard \
  --node-type t3.medium --nodes 2 --nodes-min 2 --nodes-max 4 \
  --managed

# You will likely want a second node pool for the AI workloads
# (speech-worker 4Gi / nlp 2Gi): add a nodegroup with 2 vCPU/8Gi instances,
# then tag the speech/nlp worker Deployments with a nodeSelector — optional.

# 2) Storage — the default "standard" StorageClass is gp2/gp3 EBS backed:
kubectl get storageclass standard   # should exist automatically

# 3) Image pull — either let nodes pull from Docker Hub (default) or mirror:
#    docker tag niloyrudra/auth:latest <account>.dkr.ecr.<region>.amazonaws.com/auth:latest
#    docker push <account>.dkr.ecr.<region>.amazonaws.com/auth:latest
#    ...and replace `image:` in the manifests (sed -i 's#niloyrudra/#<acct>.dkr.ecr.<region>.amazonaws.com/#g')

# 4) Ingress — two choices:
#    a) ingress-nginx:  helm install ingress-nginx ingress-nginx/ingress-nginx
#       + cert-manager for Let's Encrypt, then use k8s/40-ingress/ingress.yaml
#    b) AWS ALB:  install aws-load-balancer-controller (IAM + certs) and use
#       an Ingress with `ingressClassName: alb` + the ALB annotations.
#    Either way the backend remains Service "caddy":80 (plain HTTP) — TLS is at the edge.
```

Node sizing (matches your Railway recommendations): standard pool = PG/Node services
(512Mi-1Gi each); AI pool 2-4 vCPU/8Gi for nlp + speech-api; consider a dedicated
bigger node for speech-worker (4 vCPU/8-16Gi) so Whisper transcription isn't slowed
by neighbors. `hugepages`/instance affinity not required.

---

## 9. Deploying on Google Cloud (GKE)

```bash
# 1) Create the cluster
gcloud container clusters create langphy-prod \
  --region europe-west1 \
  --machine-type e2-standard-2 \
  --num-nodes 2 \
  --enable-autoscaling --min-nodes 2 --max-nodes 4

# 2) Storage — the default "standard" StorageClass is regional PD backed:
kubectl get storageclass standard

# 3) Images — mirror to Artifact Registry or let nodes pull from Docker Hub:
#    gcloud auth configure-docker
#    docker tag niloyrudra/auth:latest <region>-docker.pkg.dev/<proj>/langphy/auth:latest
#    docker push ...

# 4) Ingress:
#    a) GCP built-in (GLBC):  the Ingress creates an HTTP(S) LB automatically.
#       The k8s/40-ingress/ingress.yaml "syntax" is close — but GCP uses
#       `kubernetes.io/ingress.class: gce` annotations for certs/HTTPS
#       (Google-managed certs, no cert-manager needed).
#    b) ingress-nginx: helm install, then use the example file as-is.
```

---

## 10. Local dev (kind / k3s — free, same manifests)

```bash
# kind
kind create cluster
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
# k3s
curl -sfL https://get.k3s.io | sh -   # k3s has traefik + local-path storage built-in

# Redis PVC: kind's default StorageClass is a standard RW volume on the node;
# k3s provides "local-path". Both satisfy `storageClassName: standard`.

bash k8s/apply.sh        # same one-command deploy
# Check: kubectl -n langphy get pods  →  all Running
# Port-forward Caddy to test locally without an ingress:
kubectl -n langphy port-forward svc/caddy 8080:80
curl -s http://localhost:8080/api/category/version
```

---

## 11. Cutover from Railway

1. **Freeze writes that matter** — actually not needed: Neon, Atlas and Kafka are shared,
   so a parallel K8s deployment sees exactly the same data. The only shared-mutable pieces
   are Redis (fresh) and Kafka topics (same managed broker → same offsets? No: **new consumer
   group ID per service + `groupInitialRebalanceDelay`…** simplest: stop Railway first).

   Recommended order:
   1. Stand up K8s (§5) and verify every pod Healthy + consumers connected.
   2. Keep Railway running (it's read/write on the same shared DBs). This is fine for
      development; **for production do the switch below quickly** because two producers
      writing the same tables can collide.
   3. Point DNS (`api.langphy.com`) at the K8s LB/ingress (§6). Railway gets no traffic.
   4. Immediately scale Railway to zero / delete the project.
   5. Watch `kubectl -n langphy logs deploy/caddy` for a few minutes.
2. **Expo app**: no rebuild — same `EXPO_PUBLIC_API_BASE=https://api.langphy.com/api`.
3. Keep a **backout plan** = re-point DNS back to Railway's old domain while Railway still runs.
4. **Secrets check**: rotate any secret that was in a previous `secrets.yaml` document
   (`RESEND_API_KEY`, `JWT_KEY`) — the repo's old DEPLOYMENT_GUIDE already flags this.

---

## 12. Day-2 operations

- **Scaling is intentionally capped at 1 replica** per service (migrations run at pod
  startup; notification runs an in-process cron). If you later want horizontal scaling:
  (a) extract migrations to a one-off Job, (b) move notification's cron out of the API
  process, (c) then raise `replicas`.
- **Updates** = `kubectl -n langphy set image deployment/<svc> niloyrudra/<svc>=<new-tag>`
  (or edit the manifest + `kubectl apply`). With `strategy: Recreate` the old pod is stopped
  before the new one starts — brief downtime per service, same as a Railway redeploy.
- **Redis persistence**: `appendonly yes` + a 1Gi PVC. TTL'd keys evict under pressure
  (`volatile-lru`); RQ queued jobs (no TTL) are protected. Add a Prometheus
  `redis_exporter` sidecar later if you want dashboards.
- **Backups**: Neon/Atlas do this for you (configure their automated-backup windows).
  Redis is ephemeral-ish — anything important flows through Postgres/Atlas anyway.
- **Monitoring**: `kubectl top pods`, `kubectl logs`, plus the provider's managed
  monitoring (CloudWatch/EKS, Cloud Logging/GKE). For open-source observability, install
  kube-prometheus-stack — nothing in this repo blocks it.
- **Cost note**: the biggest line items are the AI node(s); idle the `speech-worker`
  node pool on a schedule if your traffic is daytime-only.

---

## 13. Why managed Kafka + in-cluster Redis? (the recommendation)

| Component | Decision | Rationale |
|---|---|---|
| PostgreSQL | **Neon (managed)** — unchanged | You chose this after self-hosting pain; SSL `rejectUnauthorized: true` in all 8 services assumes a public-CA host like Neon. |
| MongoDB | **Atlas (managed)** — unchanged | Already Atlas today. |
| Kafka | **Managed (Upstash/Confluent/Aiven)** | Your code already speaks SASL/SSL (`KAFKA_SASL_*`); self-hosted Kafka = PVC growth, log retention, compaction, upgrades — the exact monitoring pain you left behind. If you still want in-cluster, `k8s/10-infra/kafka-kraft.example.yaml` mirrors compose 1:1. |
| Redis | **In-cluster (this repo)**, 1 pod + PVC | Tiny, single-node, low latency for RQ + auth rate-limit; compose already ships it. Upstash Redis is a fine alternative if you prefer zero state in-cluster. |

> ⚠ **SASL mechanism check** (see issue #5 in §15): the shared `kafka.client.ts` uses
> `sasl: { mechanism: "plain" }`. Confluent supports PLAIN over TLS; **verify your Kafka
> provider accepts PLAIN** — Upstash docs historically push SCRAM-256, which would require
> a one-line code change (`mechanism: "scram-sha-256"`).

---

## 14. Comparing to compose — exact env-parity map

Every env var below is wired exactly like `docker-compose.yml` (top live section):

| Env var | Compose source | K8s source |
|---|---|---|
| `JWT_KEY` | `${JWT_KEY}` (x-jwt) | Secret `JWT_KEY` (envFrom) |
| `KAFKA_BROKER`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD` | x-kafka | Secret (envFrom) |
| `PG_PASSWORD` | x-pg | Secret `PG_PASSWORD` (envFrom, unused while URLs set) |
| `POSTGRES_DATABASE_URL` (per service) | `${<SVC>_POSTGRES_DATABASE_URL:-}` | Secret key → `valueFrom.secretRef` in each service file |
| `<SVC>_MONGO_URI` | `${MONGO_URI}` | Secret `MONGO_URI` → `valueFrom.secretRef` |
| `<SVC>_COLLECTION` / `<SVC>_CONTENT_VERSION` | defaults | env literal (`units`, `1`, …) |
| `REDIS_URL` (auth) | `redis://redis:6379` | ConfigMap `REDIS_URL` |
| `REDIS_HOST`/`REDIS_PORT` (speech) | `redis` / `6379` | ConfigMap |
| `NLP_SERVICE_URL` | `http://nlp:8000` | ConfigMap |
| `WHISPER_*`, `HF_HOME` | literals | ConfigMap |
| `RESEND_API_KEY`, `GOOGLE_*`, `FACEBOOK_*`, `FROM_EMAIL` | `${...}` | Secret (envFrom) |
| `CORS_ORIGIN` | `${CORS_ORIGIN:-http://localhost}` | ConfigMap `CORS_ORIGIN` |
| Caddy `{$SVC_HOST}/{$SVC_PORT}` | compose caddy env | Deployment env (Service DNS names) |

---

## 15. Issues found while analysing the project (your decision is awaited)

These are **pre-existing** — I did **not** change any application code; they affect how you
should prepare the K8s rollout.

1. 🔴 **PG SSL hardcoded** — all 8 PG services use `ssl: { rejectUnauthorized: true }`
   (`services/*/src/db/index.ts`). Works with Neon (public CA) but breaks against
   self-hosted PG without TLS, or RDS/Cloud SQL unless their CA bundle is trusted.
   → Keep Neon (as decided); nothing to change in manifests.
2. 🔴 **Docs vs compose Kafka contradiction** — AGENTS.md/DEPLOYMENT_GUIDE say Kafka is
   external (Confluent/Upstash), but the live `docker-compose.yml` top section runs
   `apache/kafka:3.7.2` (KRaft) with `KAFKA_BROKER` defaulting to `kafka:9092`, and the
   repo `.env` does not set `KAFKA_BROKER`. → K8s must set an explicit, resolvable
   `KAFKA_BROKER` (managed broker, or the optional in-cluster manifest).
3. 🔴 **`JWT_KEY` policy** — auth refuses to boot unless it's a 64-hex string; every service
   shares it (rotate per env). A previous docs' `secrets.yaml` was flagged as leaked
   (`supersecretlangphyjwtkey`). → Generate a fresh one for the K8s Secret.
4. 🟡 **Caddy speech env mismatch** — the baked Caddyfile reads `{$SPEECH_API_HOST}`
   (`infra/caddy/Caddyfile:119`) but compose sets `SPEECH_HOST`/`SPEECH_PORT`
   (`docker-compose.yml:565`). `/api/speech/*` is therefore misconfigured in the current
   compose. → The Caddy manifest sets **both** names; fix compose separately if you agree.
5. 🟡 **`INTERNAL_SERVICE_TOKEN` absent from repo `.env`** — compose + speech/nlp reference it;
   without it the NLP middleware falls back to requiring a user JWT that the speech-worker
   can't provide. → Verify it's set on Railway; it's in the K8s secrets template.
6. 🟡 **Notification in-process cron** (hourly reminder job) — replicas must stay 1 or
   users get duplicate reminders. No SIGTERM drain either (idempotent consumers make this
   safe, not nice). → Manifests pin `replicas: 1`; document the future refactor.
7. 🟡 **Migrations at pod startup** — safe at 1 replica; racing if you scale out. → Same
   pin. Extraction to a Job is the later cleanup.
8. 🔵 **Stale envs** — `QSTASH_*` in `.env` are referenced nowhere in `services/**` code
   (leftovers); `OLLAMA_API_BASE` likewise. Safe to ignore or prune.
9. 🔵 **Speech images ~600MB+** (Whisper weights baked at build) — expected; factor into
   first-deploy pull times and node disk (≥20GB).

---

## 16. FAQ / gotchas

- **`kubectl apply` errors on `spec.template`/`volumeClaimTemplates`?** Your cluster is
  older than 1.32 — upgrade it (or use an older `kind` feature flag setup). See §2 note.
- **Pods crash-loop at startup?** Run `kubectl -n langphy logs deploy/<svc> --tail=50`.
  Typical causes: missing Secret key (K8s leaves env unset rather than failing),
  `AUTH_POSTGRES_DATABASE_URL` typo, wrong `KAFKA_BROKER`. The startupProbe tolerates
  10 min of migration/retry before restart.
- **`JWT_KEY` validation failure in auth?** The Secret value must be exactly 64 hex chars.
- **Speech jobs "nlp_service_unavailable"?** `INTERNAL_SERVICE_TOKEN` mismatch between
  Secret and NLP, or `NLP_SERVICE_URL` wrong.
- **502 from a route?** Caddy env typo (host/port in `20-proxy/caddy.yaml`) or the
  upstream pod not Ready: `kubectl -n langphy logs deploy/<svc>`.
- **Why `clusterIP: None`?** Single-pod backends resolve DNS straight to the pod IP with
  no extra hop (official recommendation); keep replicas=1.
- **Where are the images?** Docker Hub `niloyrudra/*` — pin a tag (`:latest` today) or
  digest before a serious rollout.