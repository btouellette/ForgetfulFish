# Rules Engine Implementation: Phase 8 — Opening hands + mulligan

Status: planned

> Gap this phase closes: the free-mulligan rule is v1 product scope (`docs/overview/product-overview.md`:
> "Free mulligan if a 7-card opener has <2 or >=6 lands") but exists nowhere in the engine. Game setup
> currently deals opening hands with no mulligan step, no mulligan command, and no per-player mulligan
> state, so the variant's opening rule cannot be honored.

This phase touches game setup, commands, and state only. It has no dependency on Phases 4-7 and can be
executed in parallel with them by a separate agent. The client-side experience is owned by
`docs/plans/product-surface/phase-ps3-mulligan-experience.md`, which depends on `P8.3`.

Conventions and the mandatory TDD workflow are defined in `docs/plans/rules-engine/README.md`.

### [ ] P8.1 — Opening-hand state and mulligan eligibility

**Files**: `state/gameState.ts`, `engine/setup.ts`

Implement:
- Per-player opening-hand state covering whether the player has resolved their opening hand and how many free mulligans they have taken.
- `isFreeMulliganEligible(hand)`: true when a 7-card opener contains fewer than 2 or at least 6 lands, evaluated on computed card types rather than card ids.
- Game setup enters a pre-first-turn opening-hand step instead of going straight to the first upkeep.

**Test file**: `test/engine/openingHand.test.ts`
Depends: P0.7, P0.11, P1.1
Test: **Write tests FIRST**, then implement.
1. A 7-card opener with 1 land is free-mulligan eligible.
2. A 7-card opener with 6 lands is free-mulligan eligible.
3. Openers with 2-5 lands are not eligible.
4. Eligibility reads land-ness from computed types, so a Layer-3-rewritten card counts correctly.
5. Setup halts in the opening-hand step with both players unresolved.
6. `assertStateInvariants` passes in the opening-hand step.
Acceptance: opening-hand state is explicit and inspectable before the first turn begins.

### [ ] P8.2 — `MULLIGAN` and `KEEP_HAND` commands

**Files**: `commands/types.ts`, `commands/validate.ts`, `engine/processCommand.ts`

Implement:
- `MULLIGAN` shuffles the opener back into the shared library and deals a new 7-card hand, mode-routed through `GameMode` zone routing.
- `KEEP_HAND` marks the player resolved.
- Both are legal only in the opening-hand step, only for a player who has not yet resolved, and `MULLIGAN` only while that player is free-mulligan eligible.
- The first turn begins once both players have resolved.

**Test file**: `test/engine/mulligan.test.ts`
Depends: P8.1, P0.6
Test: **Write tests FIRST**, then implement.
1. `MULLIGAN` from an eligible player yields a new 7-card hand and a shuffled library.
2. `MULLIGAN` from an ineligible player is rejected.
3. `MULLIGAN` outside the opening-hand step is rejected.
4. `KEEP_HAND` resolves only the issuing player; the opponent stays unresolved.
5. The turn loop starts only after both players resolve, in the correct player order.
6. Repeated mulligans remain deterministic under a fixed seed.
7. Both players mulliganing in either order produces the same reachable states.
8. `assertStateInvariants` passes after every mulligan.
Acceptance: the variant opening rule is enforced server-authoritatively and deterministically.

### [ ] P8.3 — Opening-hand projection and legal actions

**Files**: `view/projection.ts`, `view/types.ts`

Implement:
- Project the viewer's own opening-hand status and eligibility; the opponent's hand contents stay redacted to a count.
- Surface `MULLIGAN`/`KEEP_HAND` in `LegalActionsView` so clients need no local eligibility logic.

**Test file**: `test/view/openingHandProjection.test.ts`
Depends: P8.2, P6.1
Test: **Write tests FIRST**, then implement.
1. An eligible viewer sees both mulligan and keep actions.
2. An ineligible viewer sees only keep.
3. A resolved viewer waiting on the opponent sees neither.
4. The opponent's opening hand is never revealed, including during their mulligan.
5. Library order is not leaked by a mulligan shuffle.
6. Projection passes the hidden-information audit expectations from P6.6.
Acceptance: clients can render the mulligan step entirely from the projected view.

### [ ] P8.4 — Mulligan events

**Files**: `events/event.ts`, `engine/processCommand.ts`

Implement:
- Events for hand kept and hand mulliganed, redacted per player per P6.2 rules.

**Test file**: `test/events/mulliganEvents.test.ts`
Depends: P8.2, P6.2
Test: **Write tests FIRST**, then implement.
1. A mulligan emits a shuffle and a redacted draw sequence.
2. The opponent's mulligan events carry no card identities.
3. Replay of a mulligan sequence reproduces the identical state.
4. Events carry monotonic `seq` values through the opening-hand step.
Acceptance: the opening-hand step is fully replayable.

## Exit Criteria

- A game cannot begin until both players have kept an opening hand.
- The free-mulligan condition matches `docs/overview/product-overview.md` exactly.
- The step is deterministic, replayable, and leaks no hidden information.
