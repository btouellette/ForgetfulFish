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

- [x] Add room-scoped WebSocket endpoint: `GET /ws/rooms/:roomId`.
- [x] Enforce auth/session and participant-only subscription at handshake.
- [x] Define versioned WS envelopes (`type`, `schemaVersion`, `data`) and Zod-validated payloads.
- [x] Broadcast authoritative room updates (`room_lobby_updated`, `game_started`) to both players.
- [x] Implement reconnect + resync baseline (client backoff + server snapshot on reconnect).
- [x] Add integration tests for two-player sync correctness.

### Milestone 2 Implementation Plan (Tracked Unit)

#### Phase A - Transport and Handshake

- [x] Add Fastify WebSocket support in `apps/server`.
- [x] Implement `GET /ws/rooms/:roomId` upgrade route.
- [x] Reuse existing session cookie parsing + session lookup for WS auth.
- [x] Reject unauthorized sockets and non-participant room access.
- [x] Return initial room snapshot immediately after successful connect.

#### Phase B - Protocol and Broadcasts

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

#### Phase C - Client Integration (`/play/:roomId`)

- [x] Add room WS client helper in `apps/web/lib` with `ws`/`wss` URL derivation from `NEXT_PUBLIC_SERVER_BASE_URL`.
- [x] Connect on room page load and hydrate UI from `subscribed` snapshot.
- [x] Apply incoming `room_lobby_updated` and `game_started` events to local state.
- [x] Keep existing HTTP calls for `join`, `ready`, and `start` as the mutation path.
- [x] Add connection-status UI (`connected`, `reconnecting`, `offline`).
- [x] Reconnect with bounded backoff and automatic room resubscription.

#### Phase D - Validation and Hardening

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

#### Milestone 2 Exit Criteria

- [x] Two authenticated clients in one room see ready-state changes live without refresh.
- [x] On game start, both clients reflect identical `gameId` and `gameStatus=started` in under ~1s.
- [x] Reconnecting client automatically restores current room/game state.
- [x] Unauthorized and non-participant clients cannot receive room events.
- [x] WS payload contracts are schema-validated and covered by tests.

## Milestone 2.5 - UI Integration Foundation (Next)

Goal: wire the web app to authoritative server gameplay endpoints with a durable client architecture,
while expanding browser coverage to include deterministic manual UI verification flows.

### Phase A - Integration Contract Stabilization

- [ ] Lock the initial gameplay transport contract for web clients:
  - [ ] HTTP command route: `POST /api/rooms/:id/commands`
  - [ ] Room realtime channel: `GET /ws/rooms/:roomId`
  - [ ] Versioned message envelopes from `@forgetful-fish/realtime-contract`
- [ ] Add a single web-side "game session adapter" in `apps/web/lib` that owns:
  - [ ] websocket connect/reconnect lifecycle
  - [ ] command submission API
  - [ ] server snapshot/event normalization into a UI view model
- [ ] Keep server authoritative: no rules resolution in client code; client only renders projected state and submits legal intents.

### Phase B - Frontend Stack Baseline for Arena-Style UX (Non-3D)

- [ ] Keep Next.js + React as the product shell (routing, auth, deployment alignment).
- [ ] Adopt a two-lane rendering strategy:
  - [ ] Lane 1 (now): semantic DOM + CSS + motion primitives for lobby and gameplay scaffolding
  - [ ] Lane 2 (later): optional canvas battlefield layer for high-density interaction zones only
- [ ] Pick an interaction state model optimized for rapid realtime updates and optimistic local affordances.
- [ ] Define UX constraints now (target drag latency, animation budget, reconnect/resync behavior) and enforce them in tests.

### Phase C - Gameplay UI Skeleton (No Full Visual Polish Yet)

- [ ] Build a minimal but structured gameplay surface under `apps/web/app/play/[roomId]`:
  - [ ] zones panel (library, hand, battlefield, graveyard summaries)
  - [ ] priority/status rail (whose priority, pending choice, stack depth)
  - [ ] command panel for legal actions surfaced from server responses
- [ ] Separate adapter state from presentational components to avoid coupling transport concerns into visual components.
- [ ] Preserve current lobby/start flow while extending the same route with gameplay-state rendering after start.

### Phase D - Test Expansion (Automated + Manual Browser Validation)

- [ ] Extend Playwright E2E beyond lobby sync:
  - [ ] command submission roundtrip updates both clients consistently
  - [ ] reconnect during pending choice rehydrates canonical server state
  - [ ] invalid/expired session behavior remains safe and user-visible
- [ ] Add a manual verification test pack in `e2e/manual/` with deterministic fixtures:
  - [ ] two-browser local script for observer-driven interaction checks
  - [ ] documented pass/fail checklist for UX-critical flows
  - [ ] artifact capture (trace/video/screenshots) for regression review
- [ ] Keep all manual scenarios reproducible from one command and fixed test users/seed data.

### Phase E - Execution Guardrails

- [ ] Test-first for each behavior increment (failing test before implementation).
- [ ] No client-side rule authority; all gameplay legality validated by server/game-engine.
- [ ] Keep API/WS contracts versioned and parsed at boundaries.
- [ ] Do not block on final visual system decisions before shipping integration scaffolding.

### Milestone 2.5 Exit Criteria

- [ ] Web client can render authoritative gameplay session state from server transport without full page refresh.
- [ ] Two-client command/action sync is covered by automated browser tests.
- [ ] Manual UI test pack exists, is documented, and is runnable by contributors.
- [ ] Integration architecture is ready for higher-fidelity interaction work without rewrites.

### Decision Gates Before Implementation

- [x] Confirm primary interaction rendering path for gameplay launch:
  - [ ] DOM-first only (defer canvas)
  - [x] hybrid DOM + canvas from first gameplay slice
- [x] Confirm animation/motion library baseline: Framer Motion.
- [x] Confirm manual test artifact policy: failure-only capture by default.
- [x] Confirm state model for web gameplay session adapter: Zustand for session/authoritative state, refs + RAF for interaction/visual effects.

#### Chosen Direction (2026-03-10)

- Build the first gameplay integration slice with a hybrid renderer:
  - keep React/DOM for shell, controls, overlays, and accessibility surfaces
  - use canvas for battlefield/card-surface rendering and high-frequency interactions
- Partition client state by update frequency and authority:
  - use Zustand for session/authoritative gameplay state consumed by React UI
  - keep drag/hover/targeting and visual FX in refs + RAF (non-persistent presentation lane)
- Keep Framer Motion as the initial motion system for DOM-layer transitions.
- Keep manual test artifacts on failure by default (trace/video/screenshots), with optional debug runs for always-on capture.

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
