# System Architecture Overview

## Package Boundaries

- `apps/web`: UI and auth surfaces.
- `apps/server`: authoritative API/realtime server.
- `packages/game-engine`: pure deterministic rules engine.

Boundary rule: apps consume game-engine through package exports only; no app imports from
`packages/game-engine/src/**` internals.

See `docs/standards/nextjs-boundary-rules.md` for strict web/server boundary rules.

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

- v1: in-memory active state + Postgres snapshots (`games.state`) plus append-only event log (`game_events`).
- scale: add Redis for multi-instance coordination.
- transport: WebSocket for gameplay, HTTP for auth/metadata/health.

## Realtime Room Channel (Milestone 2)

- Endpoint: `GET /ws/rooms/:id`.
- Handshake auth: same Auth.js session cookie lookup as protected HTTP routes.
- Authorization: only room participants may subscribe.
- Connection fanout uses an in-process room socket map in `apps/server`.
- Current realtime model is single-instance; multi-instance fanout requires external pub/sub (for example Redis).
- On successful connect, server sends canonical `subscribed` snapshot.
- Server broadcasts authoritative events to room subscribers after room mutations:
  - `room_lobby_updated`
  - `game_started`
- Web client reconnects with bounded backoff and treats `subscribed` as resync source of truth.

## Security and Testing

- Strict command validation + server-authoritative enforcement.
- Rate limiting and reconnect/session controls.
- Tests: engine unit/scenario, API contract, and end-to-end game flows.

Ownership split:
- Engine tests (`packages/game-engine/test/**`) own rules correctness, determinism, invariants,
  and projection/redaction correctness.
- App tests (`apps/server/test/**`, `apps/web/**`) own auth, room lifecycle, transport contracts,
  and persistence/replay wiring around engine outputs.
- Cross-boundary tests live in app layer and validate command -> engine -> persistence/transport
  integration without importing engine internals.

## Server-Engine Contract Appendix

### Supported server -> engine API surface

Server code treats the following as the supported boundary contract:
- `createInitialGameState` (and future deck bootstrap constructor)
- `processCommand`
- `getLegalCommands`
- `serializeGameStateForPersistence` / `deserializeGameStateFromPersistence`
- `projectView` / `projectEvent` (once wired into transport)

Anything else exported by the engine package is not a supported app boundary.

### Forbidden coupling

- No app import from `@forgetful-fish/game-engine/src/**` or equivalent deep-internal paths.
- No server mutation of engine internals (`state.zones`, `state.objectPool`, `state.turnState`) after initialization.
- No app-layer card/rules branching (e.g., card-specific if/else in server/web).

### Sequencing and version alignment

- `GameState.version` is engine state version (authoritative state snapshot version).
- DB `game_events.seq` is server persistence log ordering.
- `game_initialized` at DB `seq = 0` is a server lifecycle event; engine-emitted events start after initialization.
- Contract tests must assert monotonic ordering for DB event sequence and preserve explicit mapping between DB sequence and engine event sequence.

### Persistence and replay contract

- Server persists runtime state only through engine serialization APIs.
- Server does not query/branch on internal engine JSON shape for gameplay decisions.
- Deterministic replay uses persisted snapshot + ordered event log; server does not reconstruct rules outcomes outside engine logic.

### RNG contract

- Each command call uses RNG derived from current `state.rngSeed`.
- Server never advances RNG outside engine execution.
- Persisted next seed is always sourced from engine output.

### Cross-boundary contract test expectations

- App contract tests assert auth/admission, persistence/versioning, transport behavior, and boundary invariants.
- Engine contract tests assert rules correctness, determinism, and projection/redaction correctness.
- Boundary bug fixes include both: engine regression test and app contract test when persistence/transport is affected.
