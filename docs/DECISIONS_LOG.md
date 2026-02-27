# Forgetful Fish - Decisions Log

## 2026-02-25 Initial Planning Decisions

- Stack: TypeScript fullstack (`Next.js` + `Node/Fastify` + `WebSocket` + `Postgres`).
- Identity model for v1: basic accounts included from day one.
- Auth methods for v1: email magic link plus Google OAuth.
- Auth implementation: Auth.js (`next-auth`) with Prisma adapter.
- Match mode: private invite rooms in v1; public matchmaking queue added later.
- Rules enforcement: strict engine validation (illegal actions blocked).
- Priority UX: auto-pass by default with optional manual override/hold priority.
- Redis: defer until scale/multi-instance needs arise.
- Next.js boundary rule: strict client/server segregation with explicit API/WebSocket contracts; no Server Actions.

## 2026-02-26 Tooling Baseline Update

- Frontend stack baseline moved to Next.js 16 (`apps/web`) with flat ESLint config.
- Repo runtime baseline set to Node `22.13.0` via `.nvmrc` and `package.json` engines.

## 2026-02-26 Production Auth Deployment Decisions

- Canonical production host is apex `forgetfulfish.com`; `www` redirects to apex in app proxy.
- Production runtime is Docker on the existing external `nginx-proxy` network.
- Production database runs as a dedicated Postgres 16 container for ForgetfulFish.
- Prisma production schema changes are applied via migration deploy (`prisma migrate deploy`).

## 2026-02-27 Server AuthZ Baseline

- `apps/server` validates Auth.js session cookies against `auth_sessions` (+ linked `users`) as the source of truth for protected API access.
- Protected server routes return uniform unauthorized responses: `401` with `{ error: "unauthorized" }`.

## Notes

- These decisions can be revised, but current architecture and roadmap docs should treat them as defaults.
