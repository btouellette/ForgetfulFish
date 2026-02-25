# Forgetful Fish Webapp - Technology Choices (Draft)

Status: selected defaults captured in `docs/DECISIONS_LOG.md`.

## Recommended Default Stack
- Language: TypeScript end-to-end.
- Monorepo tooling: `pnpm` + `turbo`.
- Frontend: Next.js (App Router) + React + Tailwind CSS.
- Realtime/backend API: Node.js + Fastify + WebSocket (`ws` or Socket.IO).
- Auth: Auth.js (`next-auth`) + Prisma adapter + email magic link + Google OAuth.
- Validation: Zod for command/event schemas.
- Database: Postgres + Prisma ORM.
- Cache/coordination (deferred initially, add at scale): Redis.
- Testing: Vitest (unit/scenario) + Playwright (E2E).
- Deploy target: Vercel (web) + Fly.io/Render/Railway (server + Postgres).

## Why This Is a Strong Fit
- TypeScript across client/server/engine reduces integration bugs.
- Fastify and raw WebSockets are lightweight for turn-based real-time traffic.
- Pure engine package isolates complex MTG-like rules from framework code.
- Prisma accelerates early schema evolution for rooms, games, snapshots, and logs.
- Playwright validates critical multiplayer UX flows and reconnect behavior.

## Alternative Stack Options

### Option A: Fullstack TypeScript (recommended)
- Next.js + Fastify + WS + Postgres.
- Best all-around DX and hiring familiarity.

### Option B: Elixir/Phoenix
- Phoenix Channels + LiveView-style reactivity.
- Great concurrency model and real-time primitives.
- Tradeoff: smaller talent pool and different ecosystem from typical TS web teams.

### Option C: Rust game server + TS frontend
- Maximum determinism/perf for engine.
- Tradeoff: significantly slower iteration in early product stage.

## Engine Implementation Notes
- Keep engine functions pure; no direct DB/network access.
- Represent all card effects as typed, composable effect handlers.
- Prefer data-driven card definitions where possible; fallback to custom handler per complex card.

## Initial Database Tables (draft)
- `users`
- `auth_accounts` (provider links for google)
- `auth_magic_links` (nonce/token, expiry, consumed_at)
- `rooms`
- `room_players`
- `games`
- `game_snapshots`
- `game_events`

## Non-Functional Targets (v1)
- P95 action roundtrip under 250ms in same region.
- Recoverable reconnect within 10 seconds.
- Engine scenario tests for all listed cards before open beta.
