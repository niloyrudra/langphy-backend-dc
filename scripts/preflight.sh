#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Langphy — Local Preflight (run this BEFORE every Railway deploy)
# Builds the full stack from source and verifies every service using the
# SAME health checks docker-compose.yml uses (so "green locally" == "green
# on Railway" for the same endpoint).
#
# Usage:
#   bash scripts/preflight.sh                            # docker-compose.local.yml
#   bash scripts/preflight.sh docker-compose.neon.yml    # PG via Neon instead
#   bash scripts/preflight.sh docker-compose.local.yml .env.local
#   CADDY_URL=http://localhost:80 bash scripts/preflight.sh
#   PREFLIGHT_SKIP_SPEECH=1 bash scripts/preflight.sh    # skip the heavy speech bits
#
# Exit code 0 = all checks pass · 1 = at least one failed.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

COMPOSE_FILE="${1:-docker-compose.local.yml}"
ENV_FILE="${2:-.env.local}"
CADDY_URL="${CADDY_URL:-http://localhost:80}"
TIMEOUT="${PREFLIGHT_TIMEOUT:-600}"   # seconds to wait for the stack to become healthy

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PASS=0; FAIL=0
ok()  { echo "  ✔  $1"; PASS=$((PASS+1)); }
bad() { echo "  ✖  $1"; FAIL=$((FAIL+1)); }

dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# ── 0. SASL sanity check ─────────────────────────────────────────────────────
# The local KRaft broker is PLAINTEXT. If KAFKA_SASL_USERNAME/PASSWORD are set
# in the env file, KafkaJS would enable SASL+SSL and every producer/consumer
# would silently fail to connect (this exact bug bit us before — "dummy"
# credentials were left in .env.local). Catch it HERE, before the build burn.
sasl_q() { # sasl_q <KEY> — read one key from the dotenv file, strip quotes
  local val
  val="$(grep -E "^${1}=" "${ENV_FILE}" 2>/dev/null | tail -n1 | cut -d= -f2-)"
  printf '%s' "$val" | sed -e 's/^"//' -e 's/"$//'
}
_sasl_placeholder='^(dummy|changeme|change-me|placeholder|your-username|your-password|xxx|REPLACE_WITH_[A-Z0-9_]+)$'
SASL_USER="$(sasl_q KAFKA_SASL_USERNAME)"
SASL_PASS="$(sasl_q KAFKA_SASL_PASSWORD)"

if [ -n "$SASL_USER" ] || [ -n "$SASL_PASS" ]; then
  if [ -n "$SASL_USER" ] && [ -n "$SASL_PASS" ] \
      && ! printf '%s' "$SASL_USER" | grep -Eq "$_sasl_placeholder" \
      && ! printf '%s' "$SASL_PASS" | grep -Eq "$_sasl_placeholder"; then
    echo "❌ KAFKA_SASL_USERNAME/PASSWORD are set in ${ENV_FILE}."
    echo "   The local KRaft broker is PLAINTEXT — KafkaJS would enable"
    echo "   SASL+SSL and every consumer/producer would silently fail."
    echo "   Set BOTH to empty in ${ENV_FILE} and re-run."
    exit 1
  fi
  echo "⚠  Placeholder KAFKA_SASL_* values found in ${ENV_FILE} — the client"
  echo "   skips SASL for placeholders, but clean them up anyway (set empty)."
fi
echo

# ── 1. Build + start ────────────────────────────────────────────────────────
echo "══════════ Langphy local preflight ══════════"
echo "compose: $COMPOSE_FILE   env: $ENV_FILE   caddy: $CADDY_URL"
echo
echo "→ [1/4] Building & starting the stack"
echo "        (first run builds ~21 images incl. the Whisper model — 15-25 min)"
if ! dc build; then bad "docker compose build failed"; else ok "stack built"; fi
if ! dc up -d; then bad "docker compose up failed"; else ok "stack started"; fi
echo

# ── 2. Wait until every container is running ────────────────────────────────
echo "→ [2/4] Waiting up to ${TIMEOUT}s for all containers to be running..."
deadline=$((SECONDS + TIMEOUT))
while [ $SECONDS -lt $deadline ]; do
  total="$(dc ps -q 2>/dev/null | grep -c . || true)"
  running="$(dc ps --status running -q 2>/dev/null | grep -c . || true)"
  if [ "${total:-0}" -gt 0 ] && [ "${running:-0}" -eq "${total:-1}" ]; then break; fi
  sleep 5
done
total="${total:-0}"; running="${running:-0}"
[ "$running" -eq "$total" ] && ok "all containers running ($running/$total)" \
                            || bad "container count running=$running/$total"
echo

# ── 3. Health checks (mirrors docker-compose.yml healthchecks 1:1) ─────────
echo "→ [3/4] Health checks"
HTTP() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
check_http() { # check_http <label> <url> [expected]
  local code; code="$(HTTP "$2")"
  [ "$code" = "${3:-200}" ] && ok "$1 ($code)" || bad "$1 (got $code, want ${3:-200})"
}
check_exec() { # check_exec <label> <service> <cmd...>
  if dc exec -T "$2" "${@:3}" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi
}

# Through Caddy — paths that are both caddy-routed AND service-registered:
check_http "caddy /health"               "$CADDY_URL/health"
check_http "auth /api/users/db"          "$CADDY_URL/api/users/db"
check_http "progress /api/progress/db"   "$CADDY_URL/api/progress/db"
check_http "performance /api/performance/db" "$CADDY_URL/api/performance/db"
check_http "profile /api/profile/db"     "$CADDY_URL/api/profile/db"
check_http "settings /api/settings/db"   "$CADDY_URL/api/settings/db"
check_http "notification /api/notification/db" "$CADDY_URL/api/notification/db"
check_http "gateway /api/gateway/db"     "$CADDY_URL/api/gateway/db"
check_http "category /api/category/version"   "$CADDY_URL/api/category/version"
check_http "unit /api/unit/version"           "$CADDY_URL/api/unit/version"
check_http "practice /api/practices/version"  "$CADDY_URL/api/practices/version"
check_http "quiz /api/quizzes/version"        "$CADDY_URL/api/quizzes/version"
check_http "speaking /api/speaking/version"   "$CADDY_URL/api/speaking/version"
check_http "reading /api/reading/version"     "$CADDY_URL/api/reading/version"
check_http "writing /api/writing/version"     "$CADDY_URL/api/writing/version"
check_http "listening /api/listening/version" "$CADDY_URL/api/listening/version"

# Streaks exposes /health (not caddy-prefixed) → check inside the container
# exactly like its compose healthcheck does:
check_exec "streaks /health (in-container)" streaks wget --spider -q http://localhost:3001/health

# Redis:
check_exec "redis ping" redis redis-cli ping

# Kafka (KRaft) — broker responds + auto-created topics visible:
check_exec "kafka broker API versions" kafka \
  /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# AI services — compose uses python-urllib for these (no wget in the images):
check_exec "nlp /health/ready (in-container)" nlp \
  python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/ready', timeout=5)"
if [ "${PREFLIGHT_SKIP_SPEECH:-0}" = "0" ]; then
  check_exec "speech-api /health/ready (in-container)" speech-api \
    python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health/ready', timeout=5)"
  check_exec "speech-worker process alive" speech-worker sh -c "pgrep -f app.worker.py"
else
  echo "  (speech checks skipped — PREFLIGHT_SKIP_SPEECH=1)"
fi
echo

# ── 4. Summary ──────────────────────────────────────────────────────────────
echo "→ [4/4] Summary"
echo "  passed: $PASS   failed: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "✅ PREFLIGHT PASSED — safe to build & push images, then deploy to Railway."
  exit 0
else
  echo "❌ PREFLIGHT FAILED — inspect: docker compose logs <service> | tail -100"
  exit 1
fi