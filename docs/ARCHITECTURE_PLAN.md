# Forgetful Fish Webapp - Architecture Plan

## Recommended High-Level Shape
Monorepo with three primary packages:
- `apps/web`: Browser client (UI, input handling, rendering, animations).
- `apps/server`: Authoritative game server (rules engine orchestration, room/session lifecycle, real-time transport).
- `packages/game-engine`: Pure deterministic domain engine (state + commands + reducers + rules validation).

## Why This Split
- Keeps rules logic framework-agnostic and highly testable.
- Prevents client-side cheating by centralizing authoritative resolution on server.
- Enables future features (bot play, replay viewer, CLI simulation) by reusing the same engine.

## Runtime Model
- Server is the single source of truth for game state.
- Clients send intents/commands (cast spell, pass priority, choose target, declare attack, etc.).
- Server validates command legality against current state.
- Server applies command through deterministic engine and broadcasts resulting events/state patches.

## State and Rules Design
Use event-driven domain objects:
- `GameState`: players, zones, stack, turn/phase, priority holder, pending choices.
- `Command`: user intent input.
- `RuleCheck`: legal/illegal decision with reason.
- `Event`: immutable domain event emitted by command execution.

Determinism constraints:
- All randomness (shuffle/order) generated server-side from seed + RNG stream.
- Event log sufficient to rebuild current game state from initial seed.

## Data/Storage Approach
Short term:
- In-memory active game state on server process.
- Persistent snapshots + append-only event log in Postgres.

Later scale:
- Redis pub/sub + room presence + lock coordination across multiple server instances.

## Real-Time Transport
- WebSocket for low-latency turn/priority interactions.
- HTTP endpoints for health checks, lobby bootstrap, and metadata.

## UI Composition
Core screens:
- Auth (sign in/sign up)
- Lobby (create/join private room)
- Game table (zones + stack + prompts + log)
- Reconnect screen (restore by room/session token)

Core table components:
- Shared library/graveyard zone panel
- Player hand + battlefield
- Stack panel (top-first visualization)
- Priority/action bar
- Game log timeline

## Security and Fair Play Basics
- Server-authoritative rules enforcement.
- Signed reconnect token per seat.
- Strict command schema validation.
- Rate limiting and timeout handling for stalled players.
- Optional auto-pass policy with explicit hold-priority override controls.

## Testing Strategy
- Unit tests for pure engine reducers/rules.
- Scenario tests for full turn/stack interactions.
- Contract tests for client-server command/event payloads.
- End-to-end tests for create room -> play game -> finish game flows.
