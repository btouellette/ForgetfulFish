# Technology Choices (Draft)

Status: defaults are approved in `docs/DECISIONS_LOG.md`.

## Selected Stack
- TypeScript monorepo: `pnpm` + `turbo`.
- Web: Next.js + React.
- Backend: Node.js + Fastify + WebSocket.
- Auth: Auth.js + Prisma adapter + email magic link + Google OAuth.
- Data: Postgres + Prisma.
- Validation: Zod.
- Tests: Vitest + Playwright.
- Redis: deferred until scale.

## Constraints
- Next.js handles UI/auth surfaces only.
- No Next.js Server Actions for game-domain mutations.
- Web-server communication must use explicit API/WebSocket contracts.
- Client state is split by cadence and responsibility:
  - Zustand for session/authoritative gameplay state consumed by React components.
  - Refs + `requestAnimationFrame` for high-frequency interaction/visual effects (non-persistent).

## Why This Stack
- Fast iteration with shared TypeScript types.
- Authoritative server model with deterministic engine support.
- Uses mature auth and data libraries instead of custom implementations.

## Baseline Targets
- P95 action roundtrip under 250ms (same region).
- Reconnect recovery within 10 seconds.
- Scenario test coverage for full Forgetful Fish deck interactions before beta.
