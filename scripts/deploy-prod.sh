#!/usr/bin/env bash

set -euo pipefail

SERVER_API_BASE_URL="${SERVER_API_BASE_URL:-http://forgetful-fish-server:4000}"

echo "[1/5] Building production web image..."
docker build --build-arg SERVER_API_BASE_URL="$SERVER_API_BASE_URL" -f Dockerfile.web -t forgetful-fish-web:latest .

echo "[2/5] Building production server image..."
docker build -f Dockerfile.server -t forgetful-fish-server:latest .

echo "[3/5] Starting/updating production services..."
docker compose -f docker-compose.production.yml up -d

echo "[4/5] Applying production database migrations..."
docker exec forgetful-fish-web sh -lc 'cd /app && pnpm --filter @forgetful-fish/database run db:migrate:deploy'

echo "[5/5] Running auth smoke checks..."
pnpm smoke:auth

echo "Deploy complete."
