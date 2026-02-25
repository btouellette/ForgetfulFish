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

## Notes
- These decisions can be revised, but current architecture and roadmap docs should treat them as defaults.
