# Project Initialization and Dev Tooling

## Current Baseline
- Monorepo with `apps/web`, `apps/server`, `packages/game-engine`, and `packages/database`.
- Tooling: TypeScript (strict), ESLint, Prettier, Vitest, Turborepo, GitHub Actions CI.
- Boundary policy: no Next.js Server Actions for game-domain behavior.

## Validation Baseline
- Engine starter unit test exists.
- Server `/health` integration test exists.

## Core Commands
- `pnpm install`
- `pnpm dev`
- `pnpm lint && pnpm typecheck && pnpm test`
