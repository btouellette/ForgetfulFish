# Milestone 2: Realtime Gameplay Skeleton

Status: completed historical execution plan.
Archived because: the active roadmap now keeps only milestone-level summaries.
Current reference: `docs/plans/roadmap.md`.

- [x] Add room-scoped WebSocket endpoint: `GET /ws/rooms/:id`.
- [x] Enforce auth/session and participant-only subscription at handshake.
- [x] Define versioned WS envelopes (`type`, `schemaVersion`, `data`) and Zod-validated payloads.
- [x] Broadcast authoritative room updates (`room_lobby_updated`, `game_started`) to both players.
- [x] Implement reconnect + resync baseline (client backoff + server snapshot on reconnect).
- [x] Add integration tests for two-player sync correctness.

## Implementation Plan

### Phase A - Transport and Handshake

- [x] Add Fastify WebSocket support in `apps/server`.
- [x] Implement `GET /ws/rooms/:id` upgrade route.
- [x] Reuse existing session cookie parsing + session lookup for WS auth.
- [x] Reject unauthorized sockets and non-participant room access.
- [x] Return initial room snapshot immediately after successful connect.

### Phase B - Protocol and Broadcasts

- [x] Add shared WS contract schemas for server events:
  - [x] `subscribed` (initial room snapshot)
  - [x] `room_lobby_updated` (participants/ready/game status)
  - [x] `game_started` (room + game identifiers)
  - [x] `error` (recoverable protocol or authorization errors)
  - [x] `pong` (heartbeat response)
- [x] Validate all outbound/inbound WS payloads at boundary.
- [x] Maintain in-memory room connection registry (`roomId -> sockets`).
- [x] Publish room updates after successful HTTP mutations:
  - [x] `POST /api/rooms/:id/join`
  - [x] `POST /api/rooms/:id/ready`
  - [x] `POST /api/rooms/:id/start`
- [x] Ensure HTTP responses are not blocked by slow/disconnected clients.

### Phase C - Client Integration (`/play/:roomId`)

- [x] Add room WS client helper in `apps/web/lib` with `ws`/`wss` URL derivation from `NEXT_PUBLIC_SERVER_BASE_URL`.
- [x] Connect on room page load and hydrate UI from `subscribed` snapshot.
- [x] Apply incoming `room_lobby_updated` and `game_started` events to local state.
- [x] Keep existing HTTP calls for `join`, `ready`, and `start` as the mutation path.
- [x] Add connection-status UI (`connected`, `reconnecting`, `offline`).
- [x] Reconnect with bounded backoff and automatic room resubscription.

### Phase D - Validation and Hardening

- [x] Add server integration tests for:
  - [x] unauthorized WS rejection
  - [x] non-participant room rejection
  - [x] successful subscription snapshot
  - [x] two-client room update fanout on ready/start
  - [x] reconnect returning current canonical snapshot
- [x] Add web tests for WS message handling and reconnect behavior.
- [x] Add browser E2E coverage for two-client room realtime sync and reconnect UX.
- [x] Add structured connection lifecycle logs (connect, auth fail, disconnect, broadcast failure).
- [x] Update architecture/contract docs with WS endpoint and event schemas.

## Exit Criteria

- [x] Two authenticated clients in one room see ready-state changes live without refresh.
- [x] On game start, both clients reflect identical `gameId` and `gameStatus=started` in under ~1s.
- [x] Reconnecting client automatically restores current room/game state.
- [x] Unauthorized and non-participant clients cannot receive room events.
- [x] WS payload contracts are schema-validated and covered by tests.
