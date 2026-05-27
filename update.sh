#!/usr/bin/env bash
# =================================================================
# Voltcraft — update script
# Pulls latest code, rebuilds images and restarts all containers.
# Usage: bash update.sh
# =================================================================
set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.yml"

echo "==> [1/4] Pulling latest code..."
git -C "$(dirname "$COMPOSE_FILE")" pull --ff-only

echo "==> [2/4] Stopping containers..."
docker compose -f "$COMPOSE_FILE" down

echo "==> [3/4] Pulling updated images & rebuilding..."
docker compose -f "$COMPOSE_FILE" pull --ignore-buildable
docker compose -f "$COMPOSE_FILE" build --pull

echo "==> [4/4] Starting containers..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "✓ Voltcraft updated and running."
docker compose -f "$COMPOSE_FILE" ps
