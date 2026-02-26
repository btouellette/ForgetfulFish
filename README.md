# Forgetful Fish

Online implementation of the two-player shared-deck Magic variant Forgetful Fish.

## Workspace

- `apps/web`: Next.js frontend.
- `apps/server`: Fastify realtime/backend server.
- `packages/game-engine`: deterministic game engine domain package.
- `packages/database`: Prisma schema and database tooling.
- `docs`: architecture, product, auth, and workflow docs.

## Quick Start

1. Install dependencies:
   - `nvm use` (uses `.nvmrc`, Node `22.13.0`)
   - `pnpm install`
2. Create env file:
   - `cp .env.example .env`
   - Update auth/database values as needed.
3. Start local development:
   - `pnpm dev`

## Dev Tooling

- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Format check: `pnpm format:check`

## AI Agent Rules

- See `AGENTS.md`
- Detailed rules: `docs/AI_TOOLING_RULES.md`
