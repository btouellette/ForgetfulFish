# Rules Engine Implementation Plan

Status: active implementation reference. The monolithic plan has been split by phase for easier navigation and maintenance.

## Phase Files

- `docs/plans/rules-engine/phase-0-foundations.md`
- `docs/plans/rules-engine/phase-1-turn-loop-and-priority.md`
- `docs/plans/rules-engine/phase-2-stack-resolution-and-choices.md`
- `docs/plans/rules-engine/phase-3-continuous-effects-and-layers.md`
- `docs/plans/rules-engine/phase-4-combat-and-triggers.md`
- `docs/plans/rules-engine/phase-5-deck-completion.md`
- `docs/plans/rules-engine/phase-6-view-network-and-replay.md`
- `docs/plans/rules-engine/phase-7-testing-and-polish.md`

Granular task breakdown derived from `docs/architecture/rules-engine-architecture.md`. Each task is
numbered within its phase (e.g., P0.1, P0.2) and designed to be independently verifiable.
Tasks within a phase are ordered by dependency — earlier tasks unblock later ones.

**Conventions**
- File paths are relative to `packages/game-engine/src/`.
- Test file paths are relative to `packages/game-engine/test/`.
- "§N" references a section in `docs/architecture/rules-engine-architecture.md`.
- `<!-- TODO: ... -->` marks items needing further clarification before implementation.
- "Cards:" lists which of the 24 unique cards a task unblocks.
- "Depends:" lists prerequisite tasks.
- "Test:" describes the test file(s), what to test, and the expected behavior — **written BEFORE implementation code**.
- "Acceptance:" describes the concrete success condition beyond tests.
- Mode-portability guardrail: kernel/state tasks must target logical zones through `GameMode` zone routing and must not hardcode shared-library/shared-graveyard assumptions.
- Backward-compat note: if any future task text reintroduces `resolveLibrary`/`resolveGraveyard`, implement it via `resolveZone` adapters to preserve plan continuity while avoiding lock-in.
- Interpretation rule: when a task says "shared library" or "shared graveyard," treat that as a SharedDeckMode expectation in tests, not as an implementation directive.

**Current baseline**: `packages/game-engine/` now includes implemented Phase 0-2 foundations,
including deterministic state, command processing, stack resolution, pending choices,
replacement/pipeline wiring, view projection, and the currently shipped card set for those phases.
The phase files below track the remaining work from that baseline rather than a greenfield start.

---

## TDD Methodology (MANDATORY)

To ensure the rules engine is rock-solid and regression-free, we follow a strict Test-Driven Development (TDD) workflow.

### Workflow per task
1. **Write failing tests FIRST**: Create the test file (see `**Test file**` line in each task) and add the specified test cases. Run `pnpm test` to verify they fail.
2. **Implement minimum code to pass**: Write only enough code in `src/` to make the tests green.
3. **Refactor**: Clean up the implementation while keeping tests passing.
4. **Verify**: Ensure both `pnpm test` and `pnpm typecheck` pass.

### Coverage Expectations
- **Happy Path**: Standard successful execution.
- **Edge Cases**: Boundary conditions, empty collections, extreme values.
- **Negative Tests**: Invalid inputs, illegal commands, validation failures (must throw or return error signals).
- **Integration Seams**: How the component interacts with the rest of the engine.

### Minimum Test Counts
- **Type/Interface tasks**: 4+ test cases.
- **Behavioral/Logic tasks**: 6+ test cases.
- **Card implementations**: 8+ test cases (following the Card Test Harness).

### State Invariant Checking
Every integration test, scenario test, and property-based test MUST call `assertStateInvariants(state)` (see P0.14) after every command execution or state transition to ensure the engine hasn't entered an illegal state.

### Regression Prevention
Any bug found during or after implementation must be reproduced with a failing test in `test/regression/` before being fixed.

### Real-Card-First Test Data Policy

Use real card definitions in tests wherever possible.

- Prefer canonical deck cards first.
- If a canonical card is not yet implemented for an engine-phase test, use a real-card fixture (not a hypothetical card) in `test/helpers/cards/` and replace it with the production card definition once that task lands.
- Preferred fixture pool should come from commonly used fan alternates so tests stay close to real Forgetful Fish play patterns.

Current candidate fixtures from popular fan alternates:
- **Mental Note** (cheap instant draw/mill primitive) and **Miscalculation** (counter primitive) from `https://moxfield.com/decks/CsFDriThmEGanyZ5YpOunQ`
- **Telling Time** (ordered library-choice primitive) and **Portent** (topdeck manipulation primitive) from `https://moxfield.com/decks/CsFDriThmEGanyZ5YpOunQ`
- **Thought Scour** and **Frantic Inventory** (draw/graveyard-count primitives) from `https://www.mtgvault.com/friendlyfriend/decks/dandan/`

## Card Test Harness (PHASE-GATED MANDATORY)

Every card implementation is validated against this 7-category harness, but enforcement is phase-gated:

- During the card's implementation phase, cover all categories that are supported by currently implemented engine subsystems.
- If a category depends on a later subsystem (for example, layer/replacement interactions before those phases exist), mark it deferred in the card test file with the exact note `Deferred: P7.2 -- <category> blocked by <task-id>` and mirror the same entry in the Phase 7 coverage tracker.
- By Phase 7 (`P7.2`), every card must pass all 7 categories with no deferrals.

The single source of truth for deferred harness coverage is `docs/plans/rules-engine/phase-7-testing-and-polish.md#p72-coverage-tracker`.

Harness categories:

1. **Definition tests**: Card loads correctly from registry with all attributes (mana cost, types, power/toughness, abilities).
2. **Casting tests**: Card can be cast when legal (correct mana, valid targets) and is rejected when illegal.
3. **Resolution tests**: Card's `onResolve` or ETB effects produce the exact expected state changes.
4. **Mode-routing tests**: Card routes zone-dependent behavior through `GameMode` hooks, then validates expected Forgetful Fish shared-deck behavior.
5. **Interaction tests**: Card interacts correctly with continuous effects (layers) and replacement effects.
6. **Edge case tests**: What happens if targets disappear? If the library is empty? If the player has no hand?
7. **State invariant check**: `assertStateInvariants(state)` passes before, during, and after resolution.

### New Card PR Checklist
- [ ] Test file exists in `test/cards/`
- [ ] All currently unblocked harness categories are covered now
- [ ] Any blocked categories are explicitly marked with `Deferred: P7.2 -- <category> blocked by <task-id>` in the test file
- [ ] Any blocked categories are copied into the Phase 7 coverage tracker with the same task reference
- [ ] Minimum 8 test cases implemented
- [ ] `assertStateInvariants` called in every test
- [ ] Card has full 7-category coverage by `P7.2`

---

## Card-to-task mapping

Every unique card in the 80-card deck mapped to the task(s) where it's implemented:

| Card | Count | Primary Task | Dependent Tasks |
|------|-------|-------------|-----------------|
| Island | 18 | P0.11 | P1.4, P1.5 |
| Dandan | 10 | P3.9 | P4.1, P4.3, P4.4, P4.6 |
| Memory Lapse | 8 | P2.7 | P7.3 |
| Accumulated Knowledge | 4 | P2.8 | — |
| Brainstorm | 2 | P2.9 | P7.3 |
| Crystal Spray | 2 | P3.12 | P3.14, P7.6 |
| Dance of the Skywise | 2 | P3.13 | — |
| Diminishing Returns | 2 | P5.1 | P7.3 |
| Metamorphose | 2 | P5.4 | — |
| Mind Bend | 2 | P3.11 | P3.14, P7.3, P7.6 |
| Mystic Retrieval | 2 | P5.7 | — |
| Mystical Tutor | 2 | P2.10 | — |
| Predict | 2 | P2.11 | P7.3 |
| Ray of Command | 2 | P3.10 | P4.4, P7.3 |
| Supplant Form | 2 | P5.2 | P5.3, P7.3 |
| Unsubstantiate | 2 | P5.5 | — |
| Vision Charm | 2 | P5.6 | — |
| Halimar Depths | 2 | P4.8 | — |
| Izzet Boilerworks | 2 | P4.10 | — |
| Lonely Sandbar | 2 | P5.8 | — |
| Mystic Sanctuary | 2 | P4.7 | — |
| Remote Isle | 2 | P5.8 | — |
| Svyelunite Temple | 2 | P5.9 | — |
| Temple of Epiphany | 2 | P4.9 | — |

---

## Open Questions and TODOs summary

Collected from the phase files below — items needing clarification before or during implementation:

1. **P0.2** — Whether `abilities: AbilityAst[]` lives on `GameObjectBase` or only on derived view
2. **P0.3** — Phase/Step enum structure (nested vs flat)
3. **P0.5** — Event ID format (`UUID` vs `gameId:seq`)
4. **P0.6** — PRNG algorithm selection (`xoshiro256**` recommended)
5. **P0.7** — `determineOwner` on draw: confirm variant rules
6. **P0.8** — Full enumeration of `ActionType` variants for the 80-card deck
7. **P0.11** — `ActivatedAbilityAst` type for mana abilities (tap vs activated, stack interaction)
8. **P1.2** — First-turn draw skip: confirm for Forgetful Fish variant
9. **P1.5** — Special lands mana abilities and cycling distinction in AbilityAst
10. **P1.8** — Empty library loss: SBA check mechanism
11. **P2.2** — `ChoiceConstraints` discriminated union exhaustive definition
12. **P2.8** — Accumulated Knowledge count timing (stack vs graveyard)
13. **P2.9** — Brainstorm put-back: one choice or two choices
14. **P2.10** — Mystical Tutor resolution order (search → shuffle → put on top)
15. **P3.12** — Crystal Spray: instance selection mechanism for UI/choice
16. **P3.13** — Dance of the Skywise: "becomes" effect — does it remove existing abilities?
17. **P4.1** — Dandan attack legality: check Layer 3-rewritten condition at declaration time
18. **P4.7** — Mystic Sanctuary: "3+ other Islands" — self doesn't count
19. **P4.9** — Scry choice type (CHOOSE_YES_NO vs CHOOSE_CARDS)
20. **P5.1** — Diminishing Returns: confirm shared-deck handling for "shuffle hand/graveyard into library", "exile top ten", and "draw up to seven"
21. **P5.4** — Metamorphose: actual Oracle text vs architecture doc characterization
22. **P5.6** — Vision Charm phase out: minimal scope needed
23. **P5.7** — Flashback subsystem design (alternative cost + exile replacement)
24. **P5.10** — ETB lookahead: review if any card needs CR 614.12
25. **P5.11** — Cross-layer dependency scenarios enumeration
26. **P6.3** — Event-stream replication: game-engine vs server scope boundary
27. **P6.4** — Reconnect protocol: game-engine vs server scope boundary
28. **P7.4** — Property-testing library selection (fast-check recommended)
29. **P0.14** — State Invariant Checker: ensure all objectPool entries have valid zone references
30. **P0.15** — Property-Based Test Utilities: generate diverse but internally consistent GameStates
