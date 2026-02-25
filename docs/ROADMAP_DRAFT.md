# Forgetful Fish Webapp - Roadmap (Draft)

## Phase 0 - Foundations
- Finalize stack and architecture decisions.
- Set up monorepo, linting, formatting, test harness.
- Establish domain model for zones, stack, phases, and priority.

## Phase 1 - Playable Core
- Implement basic account auth and identity.
- Implement room creation/join + player seat assignment.
- Build authoritative engine skeleton with deterministic event log.
- Implement turn flow, mulligan flow, draw/cast/resolve basics.
- Implement shared library and graveyard mechanics.

## Phase 2 - Full Deck Rules Coverage
- Implement card handlers for entire listed 80-card deck.
- Add targeting/choice prompts and stack interaction UX.
- Add scenario test suite for representative card combos.

## Phase 3 - Stability and UX
- Reconnect/session recovery.
- Action log polish + clearer stack/priority indicators.
- Performance pass and reliability instrumentation.

## Phase 4 - Beta Readiness
- Closed playtest with bug triage loop.
- Improve onboarding/tutorial hints for variant-specific rules.
- Add public quick-match queue.
- Decide next features: spectators, replays, ranking, additional variants.
