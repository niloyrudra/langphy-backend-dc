#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Langphy — one-command Kubernetes deploy
#   bash k8s/apply.sh
# Requires: kubectl ≥ 1.32 connected to your cluster.
# NOTE: never run `kubectl apply -f k8s/` directly — it would also apply the
# secrets EXAMPLE file. Always use this script.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

K8S_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$K8S_DIR"

if [ ! -f 01-secrets.yaml ]; then
  echo "❌ k8s/01-secrets.yaml not found."
  echo "   cp 01-secrets.example.yaml 01-secrets.yaml"
  echo "   fill in real values (see comment header), then re-run."
  exit 1
fi

echo "→ [1/5] namespace"
kubectl apply -f 00-namespace.yaml

echo "→ [2/5] secrets + config"
kubectl apply -f 01-secrets.yaml -f 02-config.yaml

echo "→ [3/5] infra (redis; kafka ONLY if you renamed kafka-kraft.example.yaml → kafka.yaml)"
kubectl apply -f 10-infra/

echo "→ [4/5] services (19 deployments + services)"
kubectl apply -f 30-services/

echo "→ [5/5] caddy reverse proxy"
kubectl apply -f 20-proxy/

echo
echo "✅ Applied. Verify with:"
echo "   kubectl -n langphy get deployments"
echo "   kubectl -n langphy logs -f caddy-<pod>"
echo "   curl -s http://<caddy-svc>/health"
echo
echo "Optional next steps (KUBERNETES_GUIDE.md):"
echo "   • Ingress / DNS:  §6, §8 (AWS), §9 (GCP), §10 (local)"
echo "   • Per-service follow-up: kubectl -n langphy rollout status deployment/<name>"