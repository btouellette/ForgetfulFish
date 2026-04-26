# Product Roadmap

Status: active milestone-level planning overview. Detailed execution histories for completed milestones live in `docs/archive/plans/`.

## Milestone 0 - Foundations

Status: complete

- [x] Finalize stack and architecture decisions.
- [x] Set up the monorepo, linting, formatting, and test harness.
- [x] Establish the initial domain model for zones, stack, phases, and priority.

## Milestone 1 - Private Rooms and Start Gate

Status: complete

- [x] Implement account auth and identity.
- [x] Implement room creation, joining, and deterministic seat assignment.
- [x] Build the room lobby, readiness flow, and explicit game start gate.
- [x] Persist room-to-game linkage only after a valid start.
- [x] Add authorization and edge-case coverage for the lobby/start flow.

## Milestone 2 - Realtime Gameplay Skeleton

Status: complete

- [x] Add the room-scoped WebSocket endpoint and participant-only subscription model.
- [x] Define versioned websocket envelopes and schema-validated realtime payloads.
- [x] Broadcast authoritative lobby and game-start updates to both players.
- [x] Add reconnect/resync behavior and two-player sync coverage.
- [x] Capture the detailed execution history in `docs/archive/plans/milestone-2-realtime-gameplay-skeleton.md`.

## Milestone 2.5 - UI Integration Foundation

Status: complete

- [x] Lock the gameplay HTTP/WebSocket transport contract.
- [x] Add the web-side gameplay session adapter and authoritative client state flow.
- [x] Establish the hybrid DOM + canvas rendering baseline and gameplay shell.
- [x] Expand automated and manual verification for gameplay-state rendering and reconnect flows.
- [x] Preserve the detailed execution history in `docs/archive/plans/milestone-2-5-ui-integration-foundation.md`.

## Milestone 3 - Core Rules Loop

Status: in progress

- [x] Deterministic engine foundations, turn flow, and stack-resolution basics are in place through rules-engine phases 0-2.
- [x] Deliver a web-usable prototype for the shipped playable card slice (execution plan: `docs/plans/web-prototype-current-cards.md`).
- [x] Complete the Phase 3 continuous-effects and layers slice, including Dandan, Ray of Command, Mind Bend, Crystal Spray, Dance of the Skywise, and explicit Layer 3 dependency coverage; color-word Layer 3 support remains intentionally deferred until a real structured color-text surface requires it.
- [ ] Complete the remaining core-loop behaviors still planned in later phases, especially combat, trigger handling, and the rest of deck-fidelity coverage.
- [ ] Keep the milestone roadmap and split rules-engine phase files aligned as phase status changes land.

## Milestone 4 - Full Deck Rules Coverage

Status: planned

- [ ] Implement card handlers for the remaining deck cards.
- [ ] Add targeting and choice flows needed for full deck interactions.
- [ ] Expand scenario coverage for representative card combinations.

## Milestone 5 - Stability and UX Polish

Status: planned

- [ ] Harden reconnect and session recovery behavior.
- [ ] Improve the action log and stack/priority presentation.
- [ ] Run performance and reliability hardening.
- [ ] Finalize room lifecycle expiry and cleanup policy.

## Milestone 6 - Beta Readiness

Status: planned

- [ ] Run a closed playtest and triage the resulting bugs.
- [ ] Improve onboarding and variant-specific guidance.
- [ ] Add public quick-match support.
- [ ] Decide the next feature wave after beta feedback.
