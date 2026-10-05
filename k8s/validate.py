#!/usr/bin/env python3
"""
Langphy — k8s/ manifest validator (client-side, no cluster required).
Checks:
  1. Every .yaml parses as valid YAML (multi-doc safe).
  2. Every Deployment has a Service with a matching app.kubernetes.io/name selector.
  3. Every PG-backed service maps POSTGRES_DATABASE_URL from the right secret key.
  4. Every content service maps <SVC>_MONGO_URI from the MONGO_URI secret key.
  5. Caddy defines an env pair for every upstream that 20-proxy points at.

Usage:  python k8s/validate.py
"""
from __future__ import annotations

import glob
import sys
from pathlib import Path

import yaml

K8S = Path(__file__).parent

# <deployment> -> secret key it must pull for POSTGRES_DATABASE_URL
PG_URL_KEYS = {
    "auth": "AUTH_POSTGRES_DATABASE_URL",
    "streaks": "STREAKS_POSTGRES_DATABASE_URL",
    "progress": "PROGRESS_POSTGRES_DATABASE_URL",
    "performance": "PERFORMANCE_POSTGRES_DATABASE_URL",
    "profile": "PROFILE_POSTGRES_DATABASE_URL",
    "settings": "SETTINGS_POSTGRES_DATABASE_URL",
    "notification": "NOTIFICATION_POSTGRES_DATABASE_URL",
    "gateway": "GATEWAY_POSTGRES_DATABASE_URL",
}

# <deployment> -> per-service MONGO_URI env name
CONTENT_MONGO_ENVS = {
    "category": "CATEGORY_MONGO_URI",
    "unit": "UNIT_MONGO_URI",
    "practice": "PRACTICE_MONGO_URI",
    "quiz": "QUIZ_MONGO_URI",
    "speaking": "SPEAKING_MONGO_URI",
    "reading": "READING_MONGO_URI",
    "writing": "WRITING_MONGO_URI",
    "listening": "LISTENING_MONGO_URI",
}

# Upstreams the Caddyfile may reference (env pair required in the caddy manifest)
CADDY_UPSTREAMS = [
    "AUTH", "STREAKS", "PROGRESS", "PERFORMANCE", "PROFILE", "SETTINGS",
    "NOTIFICATION", "GATEWAY", "CATEGORY", "UNIT", "PRACTICE", "QUIZ",
    "SPEAKING", "READING", "WRITING", "LISTENING", "NLP", "SPEECH_API",
]


def docs_of(path: Path):
    with open(path, encoding="utf-8") as fh:
        return [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]


def main() -> int:
    files = sorted(K8S.rglob("*.yaml"))
    problems: list[str] = []
    deployments: dict[str, dict] = {}
    services: dict[str, dict] = {}
    caddy_envs: set[str] = set()
    # speech-worker intentionally has NO Service: not routable via Caddy,
    # it only consumes the RQ queue from Redis.
    no_service_deployments = {"speech-worker"}

    for f in files:
        try:
            docs = docs_of(f)
        except Exception as e:  # noqa: BLE001
            problems.append(f"PARSE ERROR {f.relative_to(K8S)}: {e}")
            continue
        kinds = [d.get("kind") for d in docs]
        print(f"{str(f.relative_to(K8S)):45s} -> {kinds}")
        for d in docs:
            meta = d.get("metadata", {})
            name = meta.get("name", "?")
            if d.get("kind") == "Deployment":
                if name == "caddy":
                    caddy_envs = {
                        e.get("name")
                        for e in d.get("spec", {})
                        .get("template", {})
                        .get("spec", {})
                        .get("containers", [{}])[0]
                        .get("env", [])
                        if e.get("name")
                    }
                deployments[name] = d
            if d.get("kind") == "Service":
                services[name] = d

    # 2) Deployment <-> Service pairing + selector match
    for name, dep in deployments.items():
        template = dep.get("spec", {}).get("template", {})
        label = template.get("metadata", {}).get("labels", {}).get("app.kubernetes.io/name")
        if not label:
            problems.append(f"[{name}] Deployment missing app.kubernetes.io/name label")
        svc = services.get(name)
        if not svc:
            if name not in no_service_deployments:
                problems.append(f"[{name}] Deployment has no matching Service named '{name}'")
        else:
            sel = svc.get("spec", {}).get("selector", {}).get("app.kubernetes.io/name")
            if sel != label:
                problems.append(
                    f"[{name}] Service selector '{sel}' != Deployment label '{label}'"
                )
    for name in services:
        if name not in deployments:
            problems.append(f"[{name}] Service has no Deployment (intentional only if documented)")

    # 3) PG services map POSTGRES_DATABASE_URL from the right secret key
    for dep_name, secret_key in PG_URL_KEYS.items():
        dep = deployments.get(dep_name)
        if not dep:
            problems.append(f"[{dep_name}] expected Deployment not found")
            continue
        template = dep.get("spec", {}).get("template", {})
        containers = template.get("spec", {}).get("containers", [])
        if not containers:
            problems.append(f"[{dep_name}] no containers found")
            continue
        envs = containers[0].get("env", [])
        env_map = {e.get("name"): e for e in envs}
        entry = env_map.get("POSTGRES_DATABASE_URL")
        if not entry or entry.get("valueFrom", {}).get("secretRef", {}).get("key") != secret_key:
            problems.append(
                f"[{dep_name}] POSTGRES_DATABASE_URL must map secret key '{secret_key}'"
            )
        if env_map.get("PG_DB", {}).get("value") is None:
            problems.append(f"[{dep_name}] PG_DB env missing")

    # 4) Content services map <SVC>_MONGO_URI from MONGO_URI secret key
    for dep_name, mongo_env in CONTENT_MONGO_ENVS.items():
        dep = deployments.get(dep_name)
        if not dep:
            problems.append(f"[{dep_name}] expected Deployment not found")
            continue
        containers = dep.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
        if not containers:
            problems.append(f"[{dep_name}] no containers found")
            continue
        envs = containers[0].get("env", [])
        env_map = {e.get("name"): e for e in envs}
        entry = env_map.get(mongo_env)
        if not entry or entry.get("valueFrom", {}).get("secretRef", {}).get("key") != "MONGO_URI":
            problems.append(f"[{dep_name}] {mongo_env} must map secret key 'MONGO_URI'")

    # 5) Caddy upstream env pairs
    for up in CADDY_UPSTREAMS:
        if f"{up}_HOST" not in caddy_envs or f"{up}_PORT" not in caddy_envs:
            problems.append(f"[caddy] missing {'/'.join([up + '_HOST', up + '_PORT'])} env")

    print()
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print(" -", p)
        return 1
    print("ALL OK — manifests are structurally consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())