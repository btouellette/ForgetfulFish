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
- [ ] Create initial game state only after explicit start (not on join).
- [x] Persist room/game linkage for started games.
- [x] Add tests for ready/unready/start authorization and edge cases.

## Milestone 2 - Realtime Gameplay Skeleton

- [ ] Add WebSocket room/game channel and connection lifecycle.
- [ ] Define command/event protocol for sync + mutations.
- [ ] Broadcast authoritative state updates to both players.
- [ ] Implement reconnect + state resync baseline.
- [ ] Add integration tests for two-player sync correctness.

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
