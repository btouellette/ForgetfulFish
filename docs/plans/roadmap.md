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
- [ ] Complete combat damage, triggers, and the Phase 4 cards (`docs/plans/rules-engine/phase-4-combat-and-triggers.md`, slices C-E).
- [ ] Make combat and the shipped post-prototype cards reachable from the browser (`docs/plans/product-surface/phase-ps1-combat-in-the-client.md`, with engine prerequisite `P6.7`).
- [ ] Surface game end to both players (`docs/plans/product-surface/phase-ps2-game-result-surfacing.md`, with engine prerequisite `P6.8`).
- [ ] Keep the milestone roadmap and the split rules-engine and product-surface phase files aligned as phase status changes land.

Execution order for the remainder of this milestone: Phase 4 slice C, then `P6.7`/`PS1`, then `P6.8`/`PS2`,
then Phase 4 slices D-E. `PS1` and `PS2` are independent of each other once their engine prerequisite has
landed, so they can run in parallel with engine work.

## Milestone 4 - Full Deck Rules Coverage

Status: planned

- [ ] Land the composable resolve-effect refactor before adding cards (`docs/plans/rules-engine/phase-9-resolve-effect-composition.md`); it gates Phase 5.
- [ ] Implement card handlers for the remaining deck cards (`docs/plans/rules-engine/phase-5-deck-completion.md`).
- [ ] Add targeting and choice flows needed for full deck interactions.
- [ ] Expand scenario coverage for representative card combinations.
- [ ] Deliver the mulligan flow: engine (`docs/plans/rules-engine/phase-8-opening-hands-and-mulligan.md`) and client (`docs/plans/product-surface/phase-ps3-mulligan-experience.md`).
- [ ] Keep every implemented card present in the room deck preset, enforced by the reachability test from `PS1.4`.

## Milestone 5 - Stability and UX Polish

Status: planned

- [ ] Harden reconnect and session recovery behavior.
- [ ] Improve the action log and stack/priority presentation.
- [ ] Run performance and reliability hardening.
- [ ] Finalize room lifecycle expiry and cleanup policy, together with the rematch-or-close decision from `PS2`.
- [ ] Work the operational backlog in `TODO.md` (monitoring, healthchecks, backups, secret rotation), deferred until a launch date is in sight.

## Milestone 6 - Beta Readiness

Status: planned

- [ ] Run a closed playtest and triage the resulting bugs.
- [ ] Improve onboarding and variant-specific guidance.
- [ ] Add public quick-match support.
- [ ] Decide the next feature wave after beta feedback.
