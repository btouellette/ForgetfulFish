# Production Cutover Checklist

Use this checklist for repeatable production deploys on the existing Docker + `nginx-proxy` host.

## 0) Preconditions

- DNS for `forgetfulfish.com` and `www.forgetfulfish.com` points to this server.
- `.env` is present and includes required auth, OAuth, and DB values.
- Google OAuth client uses apex only:
  - Origin: `https://forgetfulfish.com`
  - Redirect URI: `https://forgetfulfish.com/api/auth/callback/google`
- `docker-compose.production.yml` includes path-based routing env:
  - `forgetful-fish-web` with `VIRTUAL_PATH=/`
  - `forgetful-fish-server` with `VIRTUAL_PATH=/ws/`

## 1) Build and Deploy

Preferred single-command deploy:

```bash
pnpm deploy:prod
```

Manual equivalent:

```bash
docker build --build-arg SERVER_API_BASE_URL=http://forgetful-fish-server:4000 -f Dockerfile.web -t forgetful-fish-web:latest .
docker build -f Dockerfile.server -t forgetful-fish-server:latest .
docker compose -f docker-compose.production.yml up -d
```

## 2) Apply Database Migrations

```bash
docker exec forgetful-fish-web sh -lc 'cd /app && pnpm --filter @forgetful-fish/database run db:migrate:deploy'
```

## 3) Verify Container Health

```bash
docker ps --filter name=forgetful-fish-web --filter name=forgetful-fish-postgres
docker ps --filter name=forgetful-fish-server
docker logs --tail 100 forgetful-fish-web
docker logs --tail 100 forgetful-fish-server
docker logs --tail 100 forgetful-fish-postgres
```

## 4) Run Smoke Checks

```bash
pnpm smoke:auth
```

Expected:

- Apex `/` returns `200`.
- `www` returns `301` to apex.
- Providers include `google` and `email`.
- Google sign-in redirect includes `redirect_uri=https://forgetfulfish.com/api/auth/callback/google`.

## 5) Manual Browser Validation

- Open `https://www.forgetfulfish.com/` and confirm redirect to apex.
- Start Google sign-in and complete login.
- Confirm post-login landing and authenticated session on `/auth/verify`.
- Open a room at `/play/<roomId>` and confirm `Live connection: connected`.

## 6) Rollback (if needed)

```bash
docker tag <previous-image-id> forgetful-fish-web:latest
docker compose -f docker-compose.production.yml up -d forgetful-fish-web
```

- If DB schema/data changed incompatibly, restore from backup before re-enabling web traffic.
