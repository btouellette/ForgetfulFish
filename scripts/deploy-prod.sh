#!/usr/bin/env bash

set -euo pipefail

echo "[1/4] Building production web image..."
docker build -f Dockerfile.web -t forgetful-fish-web:latest .

echo "[2/4] Starting/updating production services..."
docker compose -f docker-compose.production.yml up -d

echo "[3/4] Applying production database migrations..."
docker exec forgetful-fish-web sh -lc 'cd /app && pnpm --filter @forgetful-fish/database run db:migrate:deploy'

echo "[4/4] Running auth smoke checks..."
pnpm smoke:auth

echo "Deploy complete."
