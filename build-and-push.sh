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
PG_SERVICES=(auth streaks progress performance profile settings notification gateway)
# PG_SERVICES=(auth streaks progress performance profile settings achievements notification gateway)

for svc in "${PG_SERVICES[@]}"; do
    echo ""
    echo "▶ Building $svc..."
    cp Dockerfile.$svc services/$svc/Dockerfile
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
    cp Dockerfile.$svc services/$svc/Dockerfile
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
docker build \
    -t $REGISTRY/speech-service:latest \
    -f services/speech-service/Dockerfile \
    ./services/speech-service
docker push $REGISTRY/speech-service:latest

echo ""
echo "✅ All images built and pushed successfully!"
echo "   Next: set your .env variables and run: docker compose up -d"