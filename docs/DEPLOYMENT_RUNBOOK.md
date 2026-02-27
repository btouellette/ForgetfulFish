# Production Deployment Runbook

This runbook covers Forgetful Fish production deploy on the existing `nginx-proxy` + ACME companion host.

## Prerequisites

- DNS `forgetfulfish.com` and `www.forgetfulfish.com` point to this host.
- Docker network `nginx-proxy` exists.
- Root `.env` contains at minimum:
  - `AUTH_SECRET`
  - `AUTH_URL=https://forgetfulfish.com`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_CALLBACK=https://forgetfulfish.com/auth/verify`
  - `SERVER_API_BASE_URL` (optional; web rewrite target for non-auth `/api/*` requests)
  - `NEXT_PUBLIC_SERVER_BASE_URL` (optional; browser direct server base URL when not using rewrite)
  - `POSTGRES_PASSWORD`
  - `AUTH_EMAIL_FROM`
  - `AUTH_EMAIL_SERVER`

## OAuth Configuration (Google)

- Authorized JavaScript origins:
  - `https://forgetfulfish.com`
- Authorized redirect URIs:
  - `https://forgetfulfish.com/api/auth/callback/google`

## Deploy

1. Build image:
   - `docker build --build-arg SERVER_API_BASE_URL=http://forgetful-fish-server:4000 -f Dockerfile.web -t forgetful-fish-web:latest .`
   - `docker build -f Dockerfile.server -t forgetful-fish-server:latest .`
2. Start/update services:
   - `docker compose -f docker-compose.production.yml up -d`
3. Apply schema migrations:
   - `docker exec forgetful-fish-web sh -lc 'cd /app && pnpm --filter @forgetful-fish/database run db:migrate:deploy'`

## Validate

- Run smoke test:
  - `./scripts/auth-smoke.sh https://forgetfulfish.com`
- Email magic-link abuse guard:
  - Requests are limited to 5 per 10 minutes per IP+email tuple.
- Manual OAuth check:
  - Visit `https://www.forgetfulfish.com/` and verify redirect to apex.
  - Sign in with Google and confirm redirect back to `/auth/verify`.

## Operations

- Container status:
  - `docker ps --filter name=forgetful-fish-web --filter name=forgetful-fish-server --filter name=forgetful-fish-postgres`
- Web logs:
  - `docker logs -f forgetful-fish-web`
- Server logs:
  - `docker logs -f forgetful-fish-server`
- DB logs:
  - `docker logs -f forgetful-fish-postgres`

## Rollback

1. Roll back web image tag and redeploy:
   - `docker tag <previous-image-id> forgetful-fish-web:latest`
   - `docker compose -f docker-compose.production.yml up -d forgetful-fish-web`
2. If migration introduced issues, restore database backup before restarting web.

## Backup Expectations

- Take daily Postgres volume snapshot (`forgetful-fish-postgres-data`).
- Run periodic restore drill to a disposable container and verify auth tables.
