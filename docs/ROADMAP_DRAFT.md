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
- [x] Add a single web-side "game session adapter" in `apps/web/lib` that owns:
  - [x] websocket connect/reconnect lifecycle
  - [x] command submission API
  - [x] server snapshot/event normalization into a UI view model
  - [x] forward raw `RoomLobbySnapshot` / `RoomGameStarted` payloads to UI callbacks for metadata only; fetch `PlayerGameView` over HTTP when per-player projected state is required
- [x] Keep server authoritative: no rules resolution in client code; client only renders projected state and submits legal intents.

#### Phase A Detailed Workplan

- [x] Contract inventory and freeze
  - [x] Pin canonical HTTP/WS payload shapes from `packages/realtime-contract/src/index.ts`.
  - [x] Add explicit contract docs for gameplay command outcomes (`stateVersion`, `lastAppliedEventSeq`, `pendingChoice`, `emittedEvents`) based on `apps/server/src/app.ts` and `apps/server/src/room-store/apply-command.ts`.
  - [x] Define forward-compatible envelope evolution rules (additive fields only, schema version bump policy).
- [x] Adapter boundary design (`apps/web/lib`)
  - [x] Create `game-session-adapter.ts` as the single integration facade used by route components.
  - [x] Consolidate command invocation currently spread across `apps/web/lib/server-api.ts` and page handlers into adapter methods.
  - [x] Keep websocket event handling behind adapter-owned callbacks/state transitions (reuse reconnect behavior from `apps/web/lib/room-realtime.ts`).
- [x] Sequence and staleness guardrails
  - [x] Track latest applied server version (`stateVersion`, `lastAppliedEventSeq`) in adapter state.
  - [x] Drop or quarantine stale/out-of-order updates before UI application.
  - [x] Define reconnect resync rule: `subscribed` snapshot is canonical reset point.
- [x] Phase A issue checkpoints (fail fast)
  - [x] Checkpoint A1: command-response shape mismatch against `realtime-contract` schemas.
  - [x] Checkpoint A2: stale snapshot overwrite during reconnect.
  - [x] Checkpoint A3: unauthorized/session-expired responses not surfaced clearly in UI.

### Phase B - Frontend Stack Baseline for Arena-Style UX (Non-3D)

- [x] Keep Next.js + React as the product shell (routing, auth, deployment alignment).
- [x] Adopt a two-lane rendering strategy:
  - [x] Lane 1 (now): hybrid DOM + canvas baseline (DOM shell/controls + canvas battlefield interactions)
  - [x] Lane 2 (later): advanced canvas effects/optimization layer for high-density board states
- [x] Pick an interaction state model optimized for rapid realtime updates and optimistic local affordances.
- [x] Define reconnect/resync and authoritative-state behavior now; defer formal performance budgets and instrumentation to later milestone work.

#### Phase B Detailed Workplan

- [x] State partition and ownership
  - [x] Introduce Zustand store for session/authoritative lane (room/game status, legal actions, pending choice, command lifecycle).
  - [x] Keep high-frequency interaction lane outside Zustand in refs + `requestAnimationFrame` loops.
  - [x] Define explicit bridge contract from Zustand state -> canvas scene model (read-only pull per frame).
- [x] Rendering architecture
  - [x] Keep React/DOM for HUD, controls, status rails, overlays, and accessibility semantics.
  - [x] Add canvas battlefield surface with deterministic draw order and card-object identity mapping.
  - [x] Install `framer-motion` for later use but do not apply it in this milestone.
- [x] Performance and resilience budgets
  - [x] Keep server-driven state application narrow enough to avoid obvious React commit storms in the gameplay shell.
  - [x] Defer formal frame budgets, latency targets, and instrumentation counters until after the basic gameplay loop is functional.
  - [x] Keep canvas scope intentionally simple: deterministic draw order, labeled rectangles, and no interaction system yet.
- [x] Phase B issue checkpoints (fail fast)
  - [x] Checkpoint B1: React rerender storms caused by broad selectors.
  - [x] Checkpoint B2: canvas frame drops under representative board density.
  - [x] Checkpoint B3: adapter/store divergence after command conflict (`409`).

### Phase C - Gameplay UI Skeleton (No Full Visual Polish Yet)

- [x] Build a minimal but structured gameplay surface under `apps/web/app/play/[roomId]`:
  - [x] zones panel (library, hand, battlefield, graveyard summaries)
  - [x] priority/status rail (whose priority, pending choice, stack depth)
  - [x] command panel for legal actions surfaced from server responses
- [x] Separate adapter state from presentational components to avoid coupling transport concerns into visual components.
- [x] Preserve current lobby/start flow while extending the same route with gameplay-state rendering after start.

#### Phase C Detailed Workplan

- [x] Route-level composition (`apps/web/app/play/[roomId]/page.tsx`)
  - [x] Keep existing lobby and start flow operational while adding post-start gameplay panels.
  - [x] Split current monolithic page logic into route container + presentational sections.
  - [x] Add explicit lifecycle states: `joining`, `lobby_ready`, `game_active`, `resyncing`, `error`.
- [x] Gameplay panel scaffolding (minimal but durable)
  - [x] Zones summary panel (counts + key visibility constraints).
  - [x] Priority/choice rail (active player, pending choice status, command lock states).
  - [x] Command panel generated from server-legal intents (no client legality inference).
  - [x] Event/debug rail for deterministic troubleshooting during development.
- [x] Canvas battlefield integration
  - [x] Map stable server object identity to canvas node identity for animation continuity.
  - [x] Defer pointer interaction adapters (hover/drag/target preview) until after the gameplay state/rendering loop is stable.
  - [x] Keep critical actions available through DOM controls while canvas remains read-only.
- [x] Phase C issue checkpoints (fail fast)
  - [x] Checkpoint C1: UI can enter illegal local state not representable by server data.
  - [x] Checkpoint C2: object identity churn breaks animation continuity.
  - [x] Checkpoint C3: reconnect clears presentation lane without restoring actionable controls.

### Phase D - Test Expansion (Automated + Manual Browser Validation)

- [x] Extend Playwright E2E beyond lobby sync:
  - [x] command submission roundtrip updates both clients consistently
  - [x] reconnect during pending choice rehydrates canonical server state
  - [x] invalid/expired session behavior remains safe and user-visible
- [x] Use the final manual QA wave below instead of creating a separate `e2e/manual/` pack in this milestone:
  - [x] capture screenshots/traces/videos under `.sisyphus/evidence/final-qa/`
  - [x] keep the manual scenarios tied to the final verification checklist rather than a parallel documentation track
- [x] Keep manual QA reproducible from the same deterministic room/auth fixture path used by automated tests.

#### Phase D Detailed Workplan

- [x] Server and contract-level regression expansion (pre-UI heavy work)
  - [x] Add command-route integration coverage for conflict, invalid command, and unauthorized cases (extend `apps/server/test/app-rooms-http.test.ts`).
  - [x] Add websocket reconnect/resync coverage for gameplay-active rooms (extend `apps/server/test/realtime-ws.sync-events.test.ts`).
  - [x] Add shared contract schema tests when introducing new adapter-consumed payload fields.
- [x] Web unit/integration coverage
  - [x] Add adapter tests with fake websocket/fetch drivers (pattern from `apps/web/lib/room-realtime.test.ts` and `apps/web/lib/server-api.test.ts`).
  - [x] Add selector-level tests for Zustand session store update behavior under bursty server updates.
  - [x] Add guardrail tests for stale snapshot rejection and version monotonicity.
- [x] Browser E2E expansion (`e2e/`)
  - [x] Two-client command roundtrip sync with gameplay command endpoint.
  - [x] Reconnect during pending choice and canonical state recovery assertions.
  - [x] Session expiration and auth failure UX validation while in gameplay route.
- [x] Manual verification approach
  - [x] do not add `e2e/manual/` docs or scripts in this milestone
  - [x] keep artifact capture under `.sisyphus/evidence/final-qa/`
  - [x] use Playwright-driven manual verification directly against deterministic fixture state when F3 runs
- [x] Phase D issue checkpoints (fail fast)
  - [x] Checkpoint D1: non-deterministic fixture behavior across reruns.
  - [x] Checkpoint D2: flaky cross-browser timing around reconnect assertions.
  - [x] Checkpoint D3: manual checklist drift from automated coverage scope.

### Phase E - Execution Guardrails

- [x] Test-first for each behavior increment (failing test before implementation).
- [x] No client-side rule authority; all gameplay legality validated by server/game-engine.
- [x] Keep API/WS contracts versioned and parsed at boundaries.
- [x] Do not block on final visual system decisions before shipping integration scaffolding.

#### Phase E Detailed Workplan

- [x] PR slicing strategy (small, reviewable verticals)
  - [x] PR1: adapter contract and store scaffolding (no canvas yet).
  - [x] PR2: canvas battlefield shell + interaction refs/RAF bridge.
  - [x] PR3: gameplay panel wiring + command flows.
  - [x] PR4: automated test expansion.
  - [x] PR5: final verification wave evidence, cleanup, and milestone-close checks.
- [x] Verification gate per PR
  - [x] `pnpm --filter @forgetful-fish/web test`
  - [x] `pnpm --filter @forgetful-fish/server test`
  - [x] `pnpm test:e2e` for affected flows
  - [x] `pnpm typecheck` and `pnpm lint`
- [x] Non-negotiable invariants
  - [x] Server remains sole authority for legality and state transitions.
  - [x] Reconnect always resolves to canonical snapshot, never local optimistic state.
  - [x] Hidden-information boundaries are preserved in all client-projected views.

### Cross-Phase Risk Register (Track From Day 1)

- [x] Transport ordering and duplication risk
  - mitigation: monotonic version checks, stale update drops, reconnect snapshot reset
- [x] Interaction smoothness risk under board density
  - mitigation: refs+RAF interaction lane, capped per-frame work, draw-call budgeting
- [x] Test flake risk from asynchronous realtime flows
  - mitigation: deterministic fixture tokens/rooms, explicit wait-for-message-type helpers, bounded retry policy
- [x] Accessibility and usability risk from canvas-first interactions
  - mitigation: DOM control fallbacks for critical actions, clear status rails and command affordances
- [x] Scope creep risk before core integration stabilizes
  - mitigation: PR slicing, phase exit gates, defer visual polish until correctness and resync behavior are stable

### Current Gap Inventory (Verified In Repo)

- [x] Web command submission gap
  - `apps/web/lib/server-api.ts` now exposes a typed client helper for `POST /api/rooms/:id/commands`.
- [x] Realtime gameplay update gap
  - `packages/realtime-contract/src/index.ts` now includes a versioned `room_game_updated` websocket message for gameplay command application updates.
  - `apps/server/src/app.ts` now broadcasts applied gameplay command updates to subscribed room sockets.
- [x] Route-level gameplay wiring gap
  - `apps/web/app/play/[roomId]/page.tsx` currently wires lobby/start sync but does not yet implement gameplay command + gameplay-state rendering loop.
- [x] Horizontal scale fanout gap
  - `apps/server/src/app.ts` uses in-process room socket registry; multi-instance websocket fanout needs external pub/sub when scaling beyond single instance.

### Milestone 2.5 Exit Criteria (target once T3/T4 land)

- [x] Web client can render authoritative gameplay session state from server transport without full page refresh.
- [x] Two-client command/action sync is covered by automated browser tests.
- [x] Manual QA flow is documented through the final verification wave and reproducible by contributors.
- [x] Integration architecture is ready for higher-fidelity interaction work without rewrites.

### Decision Gates Before Implementation

- [x] Confirm primary interaction rendering path for gameplay launch:
  - [x] DOM-first only (defer canvas)
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

### Approved Execution Slices (2026-03-11)

- [x] The detailed task reference below supersedes the earlier high-level Phase B-D bullets whenever there is any ambiguity.
- [x] Execute Milestone 2.5 through small PR slices on top of updated `main`; do not batch Phase B+C into one branch.
- [x] Keep roadmap and execution aligned with the approved scope defaults:
  - [x] Minimal player projection only for this milestone: own hand objects, opponent hand count, zone counts/visible objects, turn state, life totals, mana pools, pending choice, stack summary.
  - [x] Use HTTP fetches for projected game state on `game_started`, active-game `subscribed`, and `room_game_updated`; do not expand WS payloads to per-player game projections in this milestone.
  - [x] Command panel scope stays limited to `PASS_PRIORITY`, `MAKE_CHOICE`, and `CONCEDE`; do not add a broader legal-actions manifest yet.
  - [x] `viewerPlayerId` must be present in the projected game-state payload.
  - [x] Target transport for per-player projected state is `PlayerGameView` only, and adapters fetch it over HTTP because WS events still do not carry full `PlayerGameView` payloads.

#### Verified Preconditions And Repo Realities

- [x] `GET /api/rooms/:id/game` now exposes participant-scoped projected state; clients still receive gameplay command metadata from `POST /api/rooms/:id/commands`.
- [x] `room_game_updated` currently carries only `{ roomId, gameId, stateVersion, lastAppliedEventSeq, pendingChoice, emittedEvents }`; it does not carry full projected state.
- [x] `subscribed` still provides only lobby snapshot data, so reconnect during active games now triggers an HTTP game-state fetch.
- [x] `apps/web/app/play/[roomId]/page.tsx` is now a thin server entrypoint, and the route-level integration logic lives in `PlayRoomContainer`.
- [x] `zustand` and `framer-motion` are now part of the `apps/web` dependency baseline on `main`.
- [x] `apps/web/components/play/` and `apps/web/components/play/renderer/` now exist as app-level component roots; do not create shared package abstractions for this milestone.

#### Mandatory Guardrails For Remaining Execution

- [x] Hidden information stays hidden: no opponent hand identities, no library order, no `rngSeed`, no `lkiStore`, no `triggerQueue`, no `continuousEffects`, no raw engine internals in client-visible payloads.
- [x] Client code remains render-only: no rules resolution, no legality inference, no optimistic authoritative state, no app-layer card/rules branching.
- [x] Keep the gameplay renderer intentionally minimal: DOM shell + Canvas 2D rectangles; no PixiJS, Three.js, drag-and-drop engine, or high-frequency animation framework usage.
- [x] Use CSS Modules for all new play-route components; do not grow `globals.css` except for narrow cleanup during page split.
- [x] Store design is per-page-instance only; no global gameplay singleton is used.

#### Required Store Contract

- [x] `apps/web/lib/stores/game-store.ts` now defines a single state contract that all new play components can read from:
  - [x] `viewModel: GameSessionViewModel | null`
  - [x] `gameView: PlayerGameView | null`
  - [x] `lifecycleState: PlayLifecycleState`
  - [x] `lobbySnapshot: { participants, gameId, gameStatus } | null`
  - [x] `pendingChoice: PendingChoice | null`
  - [x] `recentEvents: { seq: number; eventType: string }[]`
  - [x] `isSubmittingCommand: boolean`
  - [x] `isLoadingGameState: boolean`
  - [x] `error: string | null`
- [x] UI consumption stays explicit:
  - [x] `PlayRoomView` reads `lifecycleState`
  - [x] `LobbyView` reads `lobbySnapshot`
  - [x] `CommandPanel` reads `pendingChoice`, `isSubmittingCommand`, `error`
  - [x] `StatusRail` reads `gameView.turnState`, `gameView.viewer.life`, `gameView.opponent.life`, `gameView.viewerPlayerId`
  - [x] `ZonesSummaryPanel` reads `gameView.zones`
  - [x] `EventRail` reads `recentEvents`
  - [x] Canvas wiring reads `gameView.objectPool`

#### Definition Of Done For Phase B+C

- [x] `pnpm --filter @forgetful-fish/game-engine test` passes with the projection test suite.
- [x] `pnpm --filter @forgetful-fish/server test` passes with game-state endpoint coverage.
- [x] `pnpm --filter @forgetful-fish/web test` passes with store, component, and route integration coverage.
- [x] `pnpm lint` and `pnpm typecheck` pass before merge for every slice.
- [x] `GET /api/rooms/:id/game` returns projected state with player-specific hidden-info filtering.
- [x] The play route transitions from lobby to gameplay without losing reconnect/resync behavior.
- [x] The command panel can submit pass-priority, make-choice, and concede through the adapter/store path.
- [x] The battlefield canvas renders deterministic placeholder cards from projected battlefield objects.

#### Approved Wave Order

- [x] Wave 0: T1 -> T2 -> T3 -> T4
- [x] Wave 1: (T5 || T6) -> T7
- [x] Wave 2: T8 -> T9
- [x] Wave 3: (T10 || T11 || T12 || T13) -> T14
- [x] Wave 4: (T15 || T16) -> T17
- [x] Final Wave: F1 || F2 || F3 || F4

#### PR Loop Requirements For These Slices

- [x] Every slice starts with a failing test before implementation.
- [x] Every slice opens as a feature-branch PR; do not push direct commits to `main`.
- [x] Every slice must pass `pnpm --filter @forgetful-fish/game-engine test`, `pnpm --filter @forgetful-fish/server test` when server code changes, `pnpm --filter @forgetful-fish/web test` when web code changes, plus `pnpm lint` and `pnpm typecheck` before merge.
- [x] Every PR waits for strict CI green and Copilot review triage before merge.
- [x] Hidden-information checks are mandatory in engine and server tests before any gameplay UI panel work is considered complete.

#### Detailed Task Reference (Execution Source Of Truth)

- [x] T1. Player game view contract
  - Files: `packages/game-engine/src/view/types.ts`, `packages/game-engine/test/view/types.test.ts`, `packages/game-engine/src/index.ts`, `packages/realtime-contract/src/index.ts`, `packages/realtime-contract/test/schema.test.ts`
  - Deliverables: `PlayerGameView`, `PlayerView`, `OpponentView`, `GameObjectView`, `ZoneView`, `StackItemView`, `playerGameViewSchema`
  - Contract details: `PlayerView` and `OpponentView` both include `life` and `manaPool`; only the viewer receives full hand object details
  - Non-negotiable shape notes: JSON-safe `objectPool` record, no `abilities`, no `rngSeed`, no `lkiStore`, no `triggerQueue`, no opponent hand identities, no library identities/order
  - Acceptance: root export exists; schema validates well-formed view; schema rejects leaked secret fields
  - QA and evidence: `pnpm --filter @forgetful-fish/game-engine test`, `pnpm --filter @forgetful-fish/realtime-contract test`; capture `task-1-zod-schema-validation.txt`, `task-1-typecheck.txt`
  - Commit target: `Add PlayerGameView types and runtime schemas`

- [x] T2. Player-view projection
  - Files: `packages/game-engine/src/view/projection.ts`, `packages/game-engine/test/view/projection.test.ts`, `packages/game-engine/test/view/projection-redaction.test.ts`, `packages/game-engine/src/index.ts`
  - Depends on: T1
  - Deliverables: `projectPlayerView(state, viewerPlayerId)` projecting viewer hand, opponent hand count, public zones, stack summary, `pendingChoice`, turn-state view, and both players' `manaPool`
  - Hidden-info rules: opponent hand stays count-only; shared library stays count-only; `rngSeed`, `lkiStore`, `triggerQueue`, `continuousEffects`, `engineVersion`, and mode internals stay out
  - Acceptance: battlefield/graveyard/exile/stack objects visible; viewer hand visible; opponent hand/library hidden; pending choice scoped to acting player
  - QA and evidence: focused Vitest redaction cases for opponent hand, library, stripped secret fields; capture `task-2-opponent-hand-redaction.txt`, `task-2-secrets-stripped.txt`, `task-2-library-redaction.txt`
  - Commit target: `Add player-view projection function`

- [x] T3. Authenticated game-state endpoint
  - Files: `apps/server/src/room-store/get-game-state.ts`, `apps/server/src/room-store/types.ts`, `apps/server/src/room-store/index.ts`, `apps/server/src/app.ts`, `apps/server/src/schemas.ts`, `apps/server/test/e2e-fixture-server.ts`, server endpoint tests
  - Depends on: T1, T2
  - Deliverables: `GET /api/rooms/:id/game` guarded by `authorizeRequest`, participant check, active-game check, projection via `projectPlayerView`
  - Status codes: `401` unauthenticated, `403` non-participant, `404` no active game, `200` projected `PlayerGameView`
  - Acceptance: route registered; room-store interface updated; response validated against `playerGameViewSchema`; no raw persisted game state returned
  - QA and evidence: curl or server-integration coverage for participant success, unauthenticated `401`, outsider `403`, hidden-info assertions; capture `task-3-authenticated-game-state.json`, `task-3-unauth-401.txt`, `task-3-non-participant-403.txt`
  - Commit target: `Add GET /api/rooms/:id/game endpoint`

- [x] T4. Client game-state fetch wiring
  - Files: `apps/web/lib/server-api.ts`, `apps/web/lib/server-api.test.ts`, `apps/web/lib/game-session-adapter.ts`, `apps/web/lib/game-session-adapter.test.ts`
  - Depends on: T1, T3
  - Deliverables: `getGameState(roomId)` with Zod validation; adapter `fetchGameState()` plus hooks on `game_started`, active-game `subscribed`, and `room_game_updated`
  - Acceptance: parsed `PlayerGameView` stored in adapter-side callbacks; invalid response shape rejected; refresh hooks cover initial game, reconnect, and subsequent updates
  - QA and evidence: adapter tests for fetch-on-events and server-api tests for validation failure; capture `task-4-adapter-game-started-fetch.txt`, `task-4-zod-validation.txt`
  - Commit target: `Add game state client API and adapter fetch`

- [x] T5. Web dependencies
  - Files: `apps/web/package.json`, `pnpm-lock.yaml`
  - Depends on: Wave 0 complete
  - Deliverables: install `zustand` and `framer-motion` only; do not use Framer Motion yet
  - Acceptance: packages listed in `apps/web`; existing web tests and typecheck stay green
  - QA and evidence: package listing plus no-regression web test run; capture `task-5-deps-installed.txt`, `task-5-no-regressions.txt`
  - Commit target: `Install zustand and framer-motion`

- [x] T6. Play CSS module infrastructure
  - Files: `apps/web/components/play/`, `apps/web/components/play/renderer/`, `apps/web/components/play/PlayRoom.module.css`
  - Depends on: Wave 0 complete
  - Deliverables: structural layout classes only: `playRoom`, `lobbyView`, `gameplayView`, `statusRail`, `commandPanel`, `sidebar`, `canvasArea`
  - Acceptance: directories exist; CSS Module compiles; no framework/Tailwind introduction; global CSS only trimmed later for `.home` migration
  - QA and evidence: build + directory existence checks; capture `task-6-css-module-build.txt`, `task-6-directory-structure.txt`
  - Commit target: `Add CSS Module infrastructure for play components`

- [x] T7. Per-page Zustand store factory
  - Files: `apps/web/lib/stores/game-store.ts`, `apps/web/lib/stores/game-store.test.ts`
  - Depends on: T4, T5
  - Deliverables: full store contract above, adapter-driven updates, store actions `passPriority`, `makeChoice`, `concede`, `fetchGameState`, `clearError`
  - Acceptance: no global singleton; transport delegated to adapter; store derives `lifecycleState`, `lobbySnapshot`, `pendingChoice`, and `recentEvents`
  - QA and evidence: tests for adapter reactivity, command delegation, error handling, pending-choice extraction, and load-state flags; capture `task-7-store-viewmodel-reactivity.txt`, `task-7-pass-priority-delegation.txt`, `task-7-error-state.txt`, `task-7-pending-choice-extraction.txt`
  - Commit target: `Add Zustand game store factory`

- [x] T8. Route extraction and context boundary
  - Files: `apps/web/app/play/[roomId]/page.tsx`, `apps/web/components/play/PlayRoomContainer.tsx`, `apps/web/components/play/GameStoreContext.tsx`
  - Depends on: T5, T6, T7
  - Deliverables: route becomes a thin server component; all adapter lifecycle logic moves into `PlayRoomContainer`; `GameStoreProvider` and `useGameStore(selector)` created
  - Acceptance: `page.tsx` drops hooks and becomes minimal; provider null-guard exists; `.home` usage migrates to module class without changing behavior
  - QA and evidence: line-count/hook grep check, no-regression tests, missing-provider error test; capture `task-8-page-minimal.txt`, `task-8-no-regressions.txt`, `task-8-context-null-guard.txt`
  - Commit target: `Extract PlayRoomContainer from page.tsx`

- [x] T9. Presentational lobby/gameplay shell
  - Files: `apps/web/components/play/PlayRoomView.tsx`, `apps/web/components/play/LobbyView.tsx`, related tests
  - Depends on: T6, T8
  - Deliverables: lifecycle switch for `joining`, `lobby_ready`, `game_active`, `resyncing`, `error`; extract lobby presentation from the old route; keep gameplay branch as placeholder until T14
  - Acceptance: lifecycle rendering covered; lobby data comes from store only; no new lobby features added
  - QA and evidence: lifecycle tests for lobby, active-game placeholder, and resyncing state; capture `task-9-lobby-rendering.txt`, `task-9-game-active-placeholder.txt`, `task-9-resyncing-state.txt`
  - Commit target: `Create PlayRoomView and LobbyView presentational components`

- [x] T10. CommandPanel
  - Files: `apps/web/components/play/CommandPanel.tsx`, `apps/web/components/play/CommandPanel.module.css`, tests
  - Depends on: T8, T9
  - Deliverables: always-visible pass-priority button, always-visible concede with confirmation, pending-choice UI, loading disable state, dismissible error state
  - Acceptance: no client legality inference; no advanced choice widgets; no motion wiring yet
  - QA and evidence: pass-priority dispatch, pending-choice rendering, disabled submission state; capture `task-10-pass-priority.txt`, `task-10-choice-ui.txt`, `task-10-disabled-state.txt`
  - Commit target: `Add CommandPanel component`

- [x] T11. StatusRail
  - Files: `apps/web/components/play/StatusRail.tsx`, `apps/web/components/play/StatusRail.module.css`, tests
  - Depends on: T8, T9
  - Deliverables: phase label, active-player indicator, priority indicator, life totals
  - Acceptance: read-only UI, no mana pool or motion work in this slice
  - QA and evidence: phase display must cover all supported phase-name mappings, plus opponent-turn and life-total cases; capture `task-11-phase-display.txt`, `task-11-opponent-turn.txt`, `task-11-life-totals.txt`
  - Commit target: `Add StatusRail component`

- [x] T12. ZonesSummaryPanel
  - Files: `apps/web/components/play/ZonesSummaryPanel.tsx`, `apps/web/components/play/ZonesSummaryPanel.module.css`, tests
  - Depends on: T8, T9
  - Deliverables: grouped zone counts for viewer and shared/opponent zones; counts only, no content drill-in
  - Acceptance: empty zones still render as `0`; no click/expand behavior added
  - QA and evidence: populated counts and empty-zone handling; capture `task-12-zone-counts.txt`, `task-12-empty-zones.txt`
  - Commit target: `Add ZonesSummaryPanel component`

- [x] T13. EventRail
  - Files: `apps/web/components/play/EventRail.tsx`, `apps/web/components/play/EventRail.module.css`, tests
  - Depends on: T8, T9
  - Deliverables: recent event list from store with sequence + type, compact debug-oriented empty state, bottom-appending behavior
  - Acceptance: no search, filtering, or detail expansion
  - QA and evidence: populated list and empty state; capture `task-13-event-list.txt`, `task-13-empty-events.txt`
  - Commit target: `Add EventRail component`

- [x] T14. Gameplay shell composition
  - Files: `apps/web/components/play/GameplayView.tsx`, `apps/web/components/play/PlayRoomView.tsx`, tests
  - Depends on: T10, T11, T12, T13
  - Deliverables: CSS-grid shell with `StatusRail`, `CommandPanel`, `ZonesSummaryPanel`, `EventRail`, and a canvas placeholder area
  - Acceptance: `PlayRoomView` swaps the `game_active` placeholder for `GameplayView`; no real canvas rendering yet
  - QA and evidence: all-panels render, PlayRoomView integration, canvas placeholder presence; capture `task-14-all-panels.txt`, `task-14-playroomview-integration.txt`, `task-14-canvas-placeholder.txt`
  - Commit target: `Wire GameplayView shell with all panels`

- [x] T15. CanvasHost
  - Files: `apps/web/components/play/renderer/CanvasHost.tsx`, `apps/web/components/play/renderer/CanvasHost.module.css`, tests
  - Depends on: T14
  - Deliverables: parent-filling `<canvas>`, forwarded or callback ref exposure for T17, `ResizeObserver`, cleanup on unmount, real pixel-size updates, optional DPR scaling
  - Acceptance: mount point only; no drawing, interactions, or canvas library imports
  - QA and evidence: mount observer, unmount cleanup, resize updates; capture `task-15-canvas-mount.txt`, `task-15-canvas-unmount.txt`, `task-15-canvas-resize.txt`
  - Commit target: `Add CanvasHost component`

- [x] T16. Battlefield 2D renderer
  - Files: `apps/web/lib/renderer/battlefield-renderer.ts`, `apps/web/lib/renderer/battlefield-renderer.test.ts`
  - Depends on: T14
  - Deliverables: pure `renderBattlefield(ctx, objects, width, height, viewerPlayerId)` function with clear wrapped grid layout, labeled rectangles, tapped distinction, owner distinction, empty-battlefield placeholder
  - Acceptance: battlefield-only rendering, no interactions, no image work, no canvas abstraction libraries
  - QA and evidence: empty battlefield, labeled objects, tapped distinction, and viewer-vs-opponent owner distinction; capture `task-16-empty-battlefield.txt`, `task-16-object-rendering.txt`, `task-16-tapped-visual.txt`
  - Commit target: `Add battlefield canvas 2D renderer`

- [x] T17. Canvas/store integration
  - Files: `apps/web/components/play/GameplayView.tsx`, tests
  - Depends on: T15, T16
  - Deliverables: replace placeholder with `CanvasHost`, filter battlefield objects from `gameView.objectPool`, drive `renderBattlefield()` through `requestAnimationFrame`, cancel pending frame on cleanup
  - Acceptance: render-on-store-update only; no interaction handlers, no dirty-checking, no sync draws
  - QA and evidence: store wiring, animation cleanup, rerender on state change; capture `task-17-canvas-store-wiring.txt`, `task-17-animation-cleanup.txt`, `task-17-re-render-on-change.txt`
  - Commit target: `Wire canvas into GameplayView and connect to store`

- [x] Final verification wave
  - [x] F1. Plan compliance audit: verify every Must Have and Must Not Have against the built code and captured evidence; output `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`
  - [x] F2. Code quality review: run `pnpm typecheck`, `pnpm lint`, `pnpm test`; search for `as any`, `@ts-ignore`, empty catches, commented-out code, stray `console.log`, and CSS-module violations; output `Build | Lint | Tests | Files | VERDICT`
  - [x] F3. Real manual QA with Playwright: create room, join/start with two players, verify lobby->game transition, panels, pass-priority roundtrip, reconnect recovery, and save screenshots under `.sisyphus/evidence/final-qa/`; output `Scenarios | Integration | Edge Cases | VERDICT`
  - [x] F4. Scope fidelity check: compare each implemented slice with its task card and guardrails, flag any missing or out-of-scope work; output `Tasks | Contamination | Unaccounted | VERDICT`

#### Verification Commands And Evidence Targets

- [x] Core command set for every remaining slice:
  - [x] `pnpm --filter @forgetful-fish/game-engine test`
  - [x] `pnpm --filter @forgetful-fish/server test`
  - [x] `pnpm --filter @forgetful-fish/web test`
  - [x] `pnpm typecheck`
  - [x] `pnpm lint`
- [x] Endpoint spot checks once T3/T4 land:
  - [x] `curl -s -b "$SESSION_COOKIE" http://localhost:4000/api/rooms/$ROOM_ID/game | jq '.viewerPlayerId'`
  - [x] `curl -s -b "$P1_COOKIE" http://localhost:4000/api/rooms/$ROOM_ID/game | jq '.opponent.handCount'`
  - [x] `curl -s -b "$SESSION_COOKIE" http://localhost:4000/api/rooms/$ROOM_ID/game | jq 'has("rngSeed")'`
  - [x] `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/rooms/$ROOM_ID/game`
- [x] Evidence naming stays task-scoped under `.sisyphus/evidence/` and final manual QA under `.sisyphus/evidence/final-qa/`.

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
