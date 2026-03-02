# Forgetful Fish

Online implementation of the two-player shared-deck Magic variant Forgetful Fish.

Production URL: `https://forgetfulfish.com`.

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
- Browser E2E: `pnpm test:e2e`
- Auth smoke check: `pnpm smoke:auth`
- Format check: `pnpm format:check`

## Production

- Build image: `docker build -f Dockerfile.web -t forgetful-fish-web:latest .`
- Runtime stack: `docker compose -f docker-compose.production.yml up -d`
- Runbook: `docs/DEPLOYMENT_RUNBOOK.md`

## AI Agent Rules

- See `AGENTS.md`
- Detailed rules: `docs/AI_TOOLING_RULES.md`
