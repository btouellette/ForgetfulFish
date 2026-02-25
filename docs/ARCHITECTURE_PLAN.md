# Architecture Plan

## Package Boundaries
- `apps/web`: UI and auth surfaces.
- `apps/server`: authoritative API/realtime server.
- `packages/game-engine`: pure deterministic rules engine.

See `docs/NEXTJS_RULES.md` for strict web/server boundary rules.

## Runtime Model
- Server is the source of truth.
- Client sends commands; server validates and applies them.
- Server emits events/state updates to both players.
- Game-domain mutations stay in `apps/server` + `packages/game-engine`.

## Domain Model
- `GameState`: zones, players, stack, turn, priority, pending choices.
- `Command`: player intent.
- `Event`: immutable result of command execution.
- Determinism: server-side RNG + replayable event log.

## Storage and Transport
- v1: in-memory active state + Postgres snapshots/event log.
- scale: add Redis for multi-instance coordination.
- transport: WebSocket for gameplay, HTTP for auth/metadata/health.

## Security and Testing
- Strict command validation + server-authoritative enforcement.
- Rate limiting and reconnect/session controls.
- Tests: engine unit/scenario, API contract, and end-to-end game flows.
