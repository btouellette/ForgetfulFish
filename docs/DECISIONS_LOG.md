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

## 2026-02-27 Room URL and Join Contract

- v1 room IDs stay UUID-based with private invite links routed as `/play/:roomId`.
- v1 has no public room discovery; link possession plus authentication gates joining.
- Room join is idempotent for existing participants and enforces a two-seat maximum.
- Seat labels are explicit and deterministic: creator is `P1`, second participant is `P2`.

## 2026-02-27 Game Start Flow Decision

- Joining a room does not auto-start a game.
- Game start requires explicit action with both players marked ready.
- Room lifecycle hardening (expiry/cleanup tuning) is deferred until gameplay UI and active game flows are in regular use.

## 2026-02-28 Hybrid Game State Persistence

- Game creation persists a versioned full snapshot (`games.state`, `games.stateVersion`) only after explicit start succeeds.
- Gameplay persistence model is hybrid: current snapshot on `games` plus append-only `game_events` for replay/audit.
- Initial start writes one `game_initialized` event at `seq=0` and aligns `games.lastAppliedEventSeq=0`.

## 2026-03-01 Dynamic DNS Automation

- Dynamic DNS for `forgetfulfish.com` uses a custom Python updater (`scripts/gandi-ddns-update.py`) instead of `gandi-live-dns` snap.
- The updater authenticates with Gandi using PAT Bearer auth and runs via systemd timer every 5 minutes.
- Managed records are `A` for `@`, `staging`, and `www` with target TTL `300`.

## 2026-03-01 Realtime WebSocket Edge Routing

- Keep browser realtime endpoint on apex host path: `wss://forgetfulfish.com/ws/rooms/:roomId`.
- Route `/ws/*` at `nginx-proxy` via container env path split (`forgetful-fish-server` uses `VIRTUAL_PATH=/ws/`).
- Do not proxy `/api/auth/*` to server; Auth.js routes remain on `forgetful-fish-web`.

## Notes

- These decisions can be revised, but current architecture and roadmap docs should treat them as defaults.
