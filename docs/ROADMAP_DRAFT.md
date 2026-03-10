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

- [x] Add room-scoped WebSocket endpoint: `GET /ws/rooms/:id`.
- [x] Enforce auth/session and participant-only subscription at handshake.
- [x] Define versioned WS envelopes (`type`, `schemaVersion`, `data`) and Zod-validated payloads.
- [x] Broadcast authoritative room updates (`room_lobby_updated`, `game_started`) to both players.
- [x] Implement reconnect + resync baseline (client backoff + server snapshot on reconnect).
- [x] Add integration tests for two-player sync correctness.

### Milestone 2 Implementation Plan (Tracked Unit)

#### Phase A - Transport and Handshake

- [x] Add Fastify WebSocket support in `apps/server`.
- [x] Implement `GET /ws/rooms/:id` upgrade route.
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

- [x] Lock the initial gameplay transport contract for web clients:
  - [x] HTTP command route: `POST /api/rooms/:id/commands`
  - [x] Room realtime channel: `GET /ws/rooms/:id`
  - [x] Versioned message envelopes from `@forgetful-fish/realtime-contract`
- [ ] Add a single web-side "game session adapter" in `apps/web/lib` that owns:
  - [x] websocket connect/reconnect lifecycle
  - [x] command submission API
  - [ ] server snapshot/event normalization into a UI view model
  - [x] forward raw `RoomLobbySnapshot` / `RoomGameStarted` payloads to UI via callbacks (no normalization layer yet)
- [ ] Keep server authoritative: no rules resolution in client code; client only renders projected state and submits legal intents.

#### Phase A Detailed Workplan

- [x] Contract inventory and freeze
  - [x] Pin canonical HTTP/WS payload shapes from `packages/realtime-contract/src/index.ts`.
  - [x] Add explicit contract docs for gameplay command outcomes (`stateVersion`, `lastAppliedEventSeq`, `pendingChoice`, `emittedEvents`) based on `apps/server/src/app.ts` and `apps/server/src/room-store/apply-command.ts`.
  - [x] Define forward-compatible envelope evolution rules (additive fields only, schema version bump policy).
- [ ] Adapter boundary design (`apps/web/lib`)
  - [x] Create `game-session-adapter.ts` as the single integration facade used by route components.
  - [x] Consolidate command invocation currently spread across `apps/web/lib/server-api.ts` and page handlers into adapter methods.
  - [x] Keep websocket event handling behind adapter-owned callbacks/state transitions (reuse reconnect behavior from `apps/web/lib/room-realtime.ts`).
- [ ] Sequence and staleness guardrails
  - [x] Track latest applied server version (`stateVersion`, `lastAppliedEventSeq`) in adapter state.
  - [x] Drop or quarantine stale/out-of-order updates before UI application.
  - [x] Define reconnect resync rule: `subscribed` snapshot is canonical reset point.
- [ ] Phase A issue checkpoints (fail fast)
  - [x] Checkpoint A1: command-response shape mismatch against `realtime-contract` schemas.
  - [x] Checkpoint A2: stale snapshot overwrite during reconnect.
  - [x] Checkpoint A3: unauthorized/session-expired responses not surfaced clearly in UI.

### Phase B - Frontend Stack Baseline for Arena-Style UX (Non-3D)

- [ ] Keep Next.js + React as the product shell (routing, auth, deployment alignment).
- [ ] Adopt a two-lane rendering strategy:
  - [ ] Lane 1 (now): hybrid DOM + canvas baseline (DOM shell/controls + canvas battlefield interactions)
  - [ ] Lane 2 (later): advanced canvas effects/optimization layer for high-density board states
- [ ] Pick an interaction state model optimized for rapid realtime updates and optimistic local affordances.
- [ ] Define UX constraints now (target drag latency, animation budget, reconnect/resync behavior) and enforce them in tests.

#### Phase B Detailed Workplan

- [ ] State partition and ownership
  - [ ] Introduce Zustand store for session/authoritative lane (room/game status, legal actions, pending choice, command lifecycle).
  - [ ] Keep high-frequency interaction lane outside Zustand in refs + `requestAnimationFrame` loops.
  - [ ] Define explicit bridge contract from Zustand state -> canvas scene model (read-only pull per frame).
- [ ] Rendering architecture
  - [ ] Keep React/DOM for HUD, controls, status rails, overlays, and accessibility semantics.
  - [ ] Add canvas battlefield surface with deterministic draw order and card-object identity mapping.
  - [ ] Use Framer Motion only for discrete DOM transitions (modals, rail updates, panel transitions), not per-frame pointer updates.
- [ ] Performance and resilience budgets
  - [ ] Document target frame budget and input latency thresholds for local drag/target flows.
  - [ ] Coalesce server-driven state application to avoid excessive React commit rates.
  - [ ] Add instrumentation counters (store update rate, ws message rate, reconnect attempts).
- [ ] Phase B issue checkpoints (fail fast)
  - [ ] Checkpoint B1: React rerender storms caused by broad selectors.
  - [ ] Checkpoint B2: canvas frame drops under representative board density.
  - [ ] Checkpoint B3: adapter/store divergence after command conflict (`409`).

### Phase C - Gameplay UI Skeleton (No Full Visual Polish Yet)

- [ ] Build a minimal but structured gameplay surface under `apps/web/app/play/[roomId]`:
  - [ ] zones panel (library, hand, battlefield, graveyard summaries)
  - [ ] priority/status rail (whose priority, pending choice, stack depth)
  - [ ] command panel for legal actions surfaced from server responses
- [ ] Separate adapter state from presentational components to avoid coupling transport concerns into visual components.
- [ ] Preserve current lobby/start flow while extending the same route with gameplay-state rendering after start.

#### Phase C Detailed Workplan

- [ ] Route-level composition (`apps/web/app/play/[roomId]/page.tsx`)
  - [ ] Keep existing lobby and start flow operational while adding post-start gameplay panels.
  - [ ] Split current monolithic page logic into route container + presentational sections.
  - [ ] Add explicit lifecycle states: `joining`, `lobby_ready`, `game_active`, `resyncing`, `error`.
- [ ] Gameplay panel scaffolding (minimal but durable)
  - [ ] Zones summary panel (counts + key visibility constraints).
  - [ ] Priority/choice rail (active player, pending choice status, command lock states).
  - [ ] Command panel generated from server-legal intents (no client legality inference).
  - [ ] Event/debug rail for deterministic troubleshooting during development.
- [ ] Canvas battlefield integration
  - [ ] Map stable server object identity to canvas node identity for animation continuity.
  - [ ] Add pointer interaction adapters (hover/drag/target preview) using refs and RAF.
  - [ ] Ensure keyboard/action alternatives exist for critical actions to maintain accessibility path.
- [ ] Phase C issue checkpoints (fail fast)
  - [ ] Checkpoint C1: UI can enter illegal local state not representable by server data.
  - [ ] Checkpoint C2: object identity churn breaks animation continuity.
  - [ ] Checkpoint C3: reconnect clears presentation lane without restoring actionable controls.

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

#### Phase D Detailed Workplan

- [ ] Server and contract-level regression expansion (pre-UI heavy work)
  - [ ] Add command-route integration coverage for conflict, invalid command, and unauthorized cases (extend `apps/server/test/app-rooms-http.test.ts`).
  - [ ] Add websocket reconnect/resync coverage for gameplay-active rooms (extend `apps/server/test/realtime-ws.sync-events.test.ts`).
  - [ ] Add shared contract schema tests when introducing new adapter-consumed payload fields.
- [ ] Web unit/integration coverage
  - [ ] Add adapter tests with fake websocket/fetch drivers (pattern from `apps/web/lib/room-realtime.test.ts` and `apps/web/lib/server-api.test.ts`).
  - [ ] Add selector-level tests for Zustand session store update behavior under bursty server updates.
  - [ ] Add guardrail tests for stale snapshot rejection and version monotonicity.
- [ ] Browser E2E expansion (`e2e/`)
  - [ ] Two-client command roundtrip sync with gameplay command endpoint.
  - [ ] Reconnect during pending choice and canonical state recovery assertions.
  - [ ] Session expiration and auth failure UX validation while in gameplay route.
- [ ] Manual verification pack (`e2e/manual/`)
  - [ ] Add deterministic fixture launcher script reusing `apps/server/test/e2e-fixture-server.ts` pattern with fixed users/tokens.
  - [ ] Add scenario checklist markdown (preconditions, steps, expected outcomes, failure signatures).
  - [ ] Define artifact capture command profiles:
    - [ ] default: failure-only traces/video/screenshots
    - [ ] debug: always-on traces/video/screenshots
- [ ] Phase D issue checkpoints (fail fast)
  - [ ] Checkpoint D1: non-deterministic fixture behavior across reruns.
  - [ ] Checkpoint D2: flaky cross-browser timing around reconnect assertions.
  - [ ] Checkpoint D3: manual checklist drift from automated coverage scope.

### Phase E - Execution Guardrails

- [ ] Test-first for each behavior increment (failing test before implementation).
- [ ] No client-side rule authority; all gameplay legality validated by server/game-engine.
- [ ] Keep API/WS contracts versioned and parsed at boundaries.
- [ ] Do not block on final visual system decisions before shipping integration scaffolding.

#### Phase E Detailed Workplan

- [ ] PR slicing strategy (small, reviewable verticals)
  - [ ] PR1: adapter contract and store scaffolding (no canvas yet).
  - [ ] PR2: canvas battlefield shell + interaction refs/RAF bridge.
  - [ ] PR3: gameplay panel wiring + command flows.
  - [ ] PR4: automated test expansion.
  - [ ] PR5: manual verification pack and runbook-level docs.
- [ ] Verification gate per PR
  - [ ] `pnpm --filter @forgetful-fish/web test`
  - [ ] `pnpm --filter @forgetful-fish/server test`
  - [ ] `pnpm test:e2e` for affected flows
  - [ ] `pnpm typecheck` and `pnpm lint`
- [ ] Non-negotiable invariants
  - [ ] Server remains sole authority for legality and state transitions.
  - [ ] Reconnect always resolves to canonical snapshot, never local optimistic state.
  - [ ] Hidden-information boundaries are preserved in all client-projected views.

### Cross-Phase Risk Register (Track From Day 1)

- [ ] Transport ordering and duplication risk
  - mitigation: monotonic version checks, stale update drops, reconnect snapshot reset
- [ ] Interaction smoothness risk under board density
  - mitigation: refs+RAF interaction lane, capped per-frame work, draw-call budgeting
- [ ] Test flake risk from asynchronous realtime flows
  - mitigation: deterministic fixture tokens/rooms, explicit wait-for-message-type helpers, bounded retry policy
- [ ] Accessibility and usability risk from canvas-first interactions
  - mitigation: DOM control fallbacks for critical actions, clear status rails and command affordances
- [ ] Scope creep risk before core integration stabilizes
  - mitigation: PR slicing, phase exit gates, defer visual polish until correctness and resync behavior are stable

### Current Gap Inventory (Verified In Repo)

- [x] Web command submission gap
  - `apps/web/lib/server-api.ts` now exposes a typed client helper for `POST /api/rooms/:id/commands`.
- [x] Realtime gameplay update gap
  - `packages/realtime-contract/src/index.ts` now includes a versioned `room_game_updated` websocket message for gameplay command application updates.
  - `apps/server/src/app.ts` now broadcasts applied gameplay command updates to subscribed room sockets.
- [ ] Route-level gameplay wiring gap
  - `apps/web/app/play/[roomId]/page.tsx` currently wires lobby/start sync but does not yet implement gameplay command + gameplay-state rendering loop.
- [ ] Horizontal scale fanout gap
  - `apps/server/src/app.ts` uses in-process room socket registry; multi-instance websocket fanout needs external pub/sub when scaling beyond single instance.

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
