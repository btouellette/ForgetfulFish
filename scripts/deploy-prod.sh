#!/usr/bin/env bash

set -euo pipefail

SERVER_API_BASE_URL="${SERVER_API_BASE_URL:-http://forgetful-fish-server:4000}"

echo "[1/6] Ensuring card image library is up to date..."
pnpm cards:download

echo "[2/6] Building production web image..."
docker build --build-arg SERVER_API_BASE_URL="$SERVER_API_BASE_URL" -f Dockerfile.web -t forgetful-fish-web:latest .

echo "[3/6] Building production server image..."
docker build -f Dockerfile.server -t forgetful-fish-server:latest .

echo "[4/6] Starting/updating production services..."
docker compose -f docker-compose.production.yml up -d

echo "[5/6] Applying production database migrations..."
docker exec forgetful-fish-web sh -lc 'cd /app && pnpm --filter @forgetful-fish/database run db:migrate:deploy'

echo "[6/6] Running auth smoke checks..."
pnpm smoke:auth

echo "Deploy complete."
