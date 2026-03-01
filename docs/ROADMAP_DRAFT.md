# Forgetful Fish Webapp - Roadmap (Draft)

## Milestone 0 - Foundations (In Progress)

- [x] Finalize stack and architecture decisions.
- [x] Set up monorepo, linting, formatting, test harness.
- [ ] Establish domain model for zones, stack, phases, and priority.

## Milestone 1 - Private Rooms + Start Gate (Next)

- [x] Implement basic account auth and identity.
- [x] Implement room creation/join + deterministic seat assignment.
- [x] Build room lobby UI on `/play/:roomId` (participants + seat + status).
- [x] Add explicit ready state per player in room lobby.
- [x] Add explicit game start action (requires both players ready).
- [x] Create initial game state only after explicit start (not on join).
- [x] Persist room/game linkage for started games.
- [x] Add tests for ready/unready/start authorization and edge cases.

## Milestone 2 - Realtime Gameplay Skeleton

- [ ] Add room-scoped WebSocket endpoint: `GET /ws/rooms/:roomId`.
- [ ] Enforce auth/session and participant-only subscription at handshake.
- [ ] Define versioned WS envelopes (`type`, `schemaVersion`, `data`) and Zod-validated payloads.
- [ ] Broadcast authoritative room updates (`room_lobby_updated`, `game_started`) to both players.
- [ ] Implement reconnect + resync baseline (client backoff + server snapshot on reconnect).
- [ ] Add integration tests for two-player sync correctness.

### Milestone 2 Implementation Plan (Tracked Unit)

#### Phase A - Transport and Handshake

- [ ] Add Fastify WebSocket support in `apps/server`.
- [ ] Implement `GET /ws/rooms/:roomId` upgrade route.
- [ ] Reuse existing session cookie parsing + session lookup for WS auth.
- [ ] Reject unauthorized sockets and non-participant room access.
- [ ] Return initial room snapshot immediately after successful connect.

#### Phase B - Protocol and Broadcasts

- [ ] Add shared WS contract schemas for server events:
  - [ ] `subscribed` (initial room snapshot)
  - [ ] `room_lobby_updated` (participants/ready/game status)
  - [ ] `game_started` (room + game identifiers)
  - [ ] `error` (recoverable protocol or authorization errors)
  - [ ] `pong` (heartbeat response)
- [ ] Validate all outbound/inbound WS payloads at boundary.
- [ ] Maintain in-memory room connection registry (`roomId -> sockets`).
- [ ] Publish room updates after successful HTTP mutations:
  - [ ] `POST /api/rooms/:id/join`
  - [ ] `POST /api/rooms/:id/ready`
  - [ ] `POST /api/rooms/:id/start`
- [ ] Ensure HTTP responses are not blocked by slow/disconnected clients.

#### Phase C - Client Integration (`/play/:roomId`)

- [ ] Add room WS client helper in `apps/web/lib` with `ws`/`wss` URL derivation from `NEXT_PUBLIC_SERVER_BASE_URL`.
- [ ] Connect on room page load and hydrate UI from `subscribed` snapshot.
- [ ] Apply incoming `room_lobby_updated` and `game_started` events to local state.
- [ ] Keep existing HTTP calls for `join`, `ready`, and `start` as the mutation path.
- [ ] Add connection-status UI (`connected`, `reconnecting`, `offline`).
- [ ] Reconnect with bounded backoff and automatic room resubscription.

#### Phase D - Validation and Hardening

- [ ] Add server integration tests for:
  - [ ] unauthorized WS rejection
  - [ ] non-participant room rejection
  - [ ] successful subscription snapshot
  - [ ] two-client room update fanout on ready/start
  - [ ] reconnect returning current canonical snapshot
- [ ] Add web tests for WS message handling and reconnect behavior.
- [ ] Add structured connection lifecycle logs (connect, auth fail, disconnect, broadcast failure).
- [ ] Update architecture/contract docs with WS endpoint and event schemas.

#### Milestone 2 Exit Criteria

- [ ] Two authenticated clients in one room see ready-state changes live without refresh.
- [ ] On game start, both clients reflect identical `gameId` and `gameStatus=started` in under ~1s.
- [ ] Reconnecting client automatically restores current room/game state.
- [ ] Unauthorized and non-participant clients cannot receive room events.
- [ ] WS payload contracts are schema-validated and covered by tests.

## Milestone 3 - Core Rules Loop

- [ ] Build authoritative engine skeleton with deterministic event log.
- [ ] Implement turn flow, mulligan flow, draw/cast/resolve basics.
- [ ] Implement shared library and graveyard mechanics.
- [ ] Add deterministic engine tests for priority and turn order.

## Milestone 4 - Full Deck Rules Coverage

- [ ] Implement card handlers for entire listed 80-card deck.
- [ ] Add targeting/choice prompts and stack interaction UX.
- [ ] Add scenario test suite for representative card combos.

## Milestone 5 - Stability and UX Polish

- [ ] Reconnect/session recovery hardening.
- [ ] Action log polish + clearer stack/priority indicators.
- [ ] Performance pass and reliability instrumentation.
- [ ] Room lifecycle hardening (expiry/cleanup policy) after active gameplay UI is in use.

## Milestone 6 - Beta Readiness

- [ ] Closed playtest with bug triage loop.
- [ ] Improve onboarding/tutorial hints for variant-specific rules.
- [ ] Add public quick-match queue.
- [ ] Decide next features: spectators, replays, ranking, additional variants.
