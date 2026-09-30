#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Build and push all Langphy Docker images
# Run from your REPO ROOT: bash build-and-push.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e  # exit on any error

REGISTRY="niloyrudra"
REPO_ROOT=$(pwd)

echo "🔨 Building from: $REPO_ROOT"

# ── PostgreSQL services ────────────────────────────────────────────────────
PG_SERVICES=(auth streaks progress performance profile settings notification gateway-service)

for svc in "${PG_SERVICES[@]}"; do
    echo ""
    echo "▶ Building $svc..."
    docker build \
        --build-context shared=./shared \
        -t $REGISTRY/$svc:latest \
        -f services/$svc/Dockerfile \
        .
    docker push $REGISTRY/$svc:latest
    echo "✅ $svc pushed"
done

# ── MongoDB services ───────────────────────────────────────────────────────
MONGO_SERVICES=(category unit practice quiz speaking reading writing listening)

for svc in "${MONGO_SERVICES[@]}"; do
    echo ""
    echo "▶ Building $svc..."
    docker build \
        -t $REGISTRY/$svc:latest \
        -f services/$svc/Dockerfile \
        .
    docker push $REGISTRY/$svc:latest
    echo "✅ $svc pushed"
done

# ── Python services ────────────────────────────────────────────────────────
echo ""
echo "▶ Building nlp-service..."
docker build \
    -t $REGISTRY/nlp-service:latest \
    -f services/nlp-service/Dockerfile \
    ./services/nlp-service
docker push $REGISTRY/nlp-service:latest

echo ""
echo "▶ Building speech-service..."
# Pass Whisper config through as build args so the baked model matches the
# runtime env (defaults match docker-compose: small / cpu / int8). The
# Dockerfile's builder stage relies on these to resolve $MODEL_SIZE etc.
docker build \
    -t $REGISTRY/speech-service:latest \
    --build-arg MODEL_SIZE="${WHISPER_MODEL_SIZE:-small}" \
    --build-arg WHISPER_DEVICE="${WHISPER_DEVICE:-cpu}" \
    --build-arg WHISPER_COMPUTE_TYPE="${WHISPER_COMPUTE_TYPE:-int8}" \
    -f services/speech-service/Dockerfile \
    ./services/speech-service
docker push $REGISTRY/speech-service:latest

# ── Infrastructure services ────────────────────────────────────────────────
echo ""
echo "▶ Building caddy..."
docker build \
    -t $REGISTRY/caddy:latest \
    -f infra/caddy/Dockerfile \
    ./infra/caddy
docker push $REGISTRY/caddy:latest

echo ""
echo "✅ All images built and pushed successfully!"
echo "   Next: set your .env variables and run: docker compose up -d"