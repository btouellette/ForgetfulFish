# Rules Engine Implementation: Phase 7 — Testing hardening + polish

Status: planned

### [ ] P7.1 — Determinism test suite

Per test strategy:
- Same seed + same command sequence → identical event stream and state hash
- Run 1000 randomized games, replay each, verify determinism

**Test file**: `test/determinism/determinism.test.ts`
Depends: P0.6, P0.10, all prior phases
Test: **Write tests FIRST**, then implement.
1. Replay 1000 games with varied seeds and varied lengths.
2. Verify state hash `H1 === H2` after full replay.
3. Verify event stream `E1 === E2` after full replay.
4. Test determinism across different game lengths (early game, mid game, late game).
5. Verify RNG state is identically preserved in all replayed steps.
6. `assertStateInvariants` holds for every replayed state.
Acceptance: 100% determinism over 1000 randomized games.

### [ ] P7.2 — Per-card sanity tests

Per test strategy (adapted from SabberStone):
- For each of 23 unique cards: load definition, create game state, cast in harness, resolve
- Assert: no crash, expected zone changes, card-specific invariants

**Test file**: `test/cards/sanity.test.ts`
Depends: all card implementations
Test: **Write tests FIRST**, then implement.
1. Run the full 7-category Card Test Harness for ALL 23 unique cards.
2. Verify each card resolves without crashing the engine.
3. Verify card-specific invariants (e.g., Dandan sacrifice) are met for all instances.
4. Verify correct zone transitions for every card type (land, instant, sorcery, creature).
5. Check for any memory leaks in card ability definitions.
6. `assertStateInvariants` passes for every card's execution.
Acceptance: All 23 cards pass full harness sanity checks.

### [ ] P7.3 — Scenario tests for complex interactions

Per §Appendix (8 key interactions):

1. **Mind Bend on Dandan** — Layer 3 rewrites all tokens, behavior changes
2. **Crystal Spray + Mind Bend on same permanent** — Layer 3 dependency ordering
3. **Brainstorm with shared library** — multi-choice persisted resolution
4. **Ray of Command stealing Dandan mid-combat** — Layer 2 + untap + must-attack
5. **Memory Lapse on opponent's spell** — counter + shared library top
6. **Predict naming card in shared library** — name choice + conditional draw
7. **Supplant Form on Dandan** — bounce + Layer 1 copy token
8. **Diminishing Returns with shared graveyard** — multi-zone shared-deck hooks

**Test file**: `test/scenarios/` — one file per interaction
Depends: all prior phases
Test: **Write tests FIRST**, then implement.
1. Scenario 1: Assert Dandan's islandwalk and sacrifice tokens all update simultaneously.
2. Scenario 2: Assert dependency ordering produces correct text regardless of Mind Bend/Crystal Spray application order.
3. Scenario 3: Assert Brainstorm reordering is reflected in the next 3 draws.
4. Scenario 4: Assert stolen Dandan must attack and returns to owner at end of turn.
5. Scenario 5: Assert countered spell is playable from the top of the shared library next turn.
6. Scenario 6: Assert naming a card and milling it results in exactly 2 draws.
7. Scenario 7: Assert token copy of Dandan has identical abilities and power/toughness.
8. Scenario 8: Assert life loss and alternating draws work correctly in the shared-deck mode.
Acceptance: All 8 key interactions pass with specific assertions.

### [ ] P7.4 — Property-based tests

Per test strategy:
- SBA loop termination: no infinite loops
- Replacement effect loop termination: apply-once guarantees termination
- State consistency invariants (reference P0.15 generators)

**Test file**: `test/properties/invariants.test.ts`
Depends: all prior phases, P0.15
Test: **Write tests FIRST**, then implement.
1. Run 1000+ random scenarios using `fast-check` generators.
2. Verify `assertStateInvariants` holds after every generated command.
3. Verify SBA loop always terminates within a reasonable number of cycles.
4. Verify replacement effect loop always terminates (no infinite loops).
5. Verify command validation never permits an illegal state transition.
6. Verify no property-based run results in a crashed engine.
Acceptance: No invariant violations found over 1000+ random scenarios.

### [ ] P7.5 — Replacement/choice torture tests

Per test strategy:
- Nested replacement effects: replacement that triggers another replacement
- Choice ordering: multiple simultaneous choices resolved in correct order
- Edge cases: empty whiteboard, zero-action pipeline, etc.

**Test file**: `test/properties/replacement-torture.test.ts`
Depends: P2.4, P2.5
Test: **Write tests FIRST**, then implement.
1. Verify nested replacements resolve in a predictable, stable order.
2. Verify `ORDER_REPLACEMENTS` choice is emitted when multiple replacements apply simultaneously.
3. Test the pipeline with 100+ concurrent actions.
4. Test the pipeline with 0 actions (empty case).
5. Verify choice resumption works correctly when nested inside a replacement effect.
6. `assertStateInvariants` holds during complex replacement cycles.
Acceptance: No crashes or infinite loops in replacement/choice logic.

### [ ] P7.6 — Layer ordering targeted tests

Per test strategy:
- Mind Bend + Crystal Spray on same permanent (Layer 3 dependency)
- Cross-layer interactions (Layer 3 affects Layer 6 ability content)
- Timestamp ordering within layers

**Test file**: `test/layers/ordering.test.ts`
Depends: P3.5, P3.14
Test: **Write tests FIRST**, then implement.
1. Verify Layer 3 text changes are always applied before Layer 6 ability grants.
2. Verify that type changes in Layer 4 correctly update ability applicability in Layer 6.
3. Verify timestamp ordering is strictly followed within each sublayer.
4. Verify that removing a high-timestamp effect correctly reverts the state.
5. Verify that "characteristic-defining abilities" in Layer 7a are correctly prioritized.
6. `computeGameObject` output matches expected manual calculations for 10+ layers.
Acceptance: Layer ordering matches MTG CR 613.

### [ ] P7.7 — Regression test infrastructure

Set up:
- Convention: every fixed bug gets a test in `test/regression/`
- Test naming: `{issue-number}-{brief-description}.test.ts`
- These tests are preserved forever

**Test file**: `test/regression/infra.test.ts`
Depends: none
Test: **Write tests FIRST**, then implement.
1. Verify regression test template is correctly structured and usable.
2. Verify the `test/regression/` directory is monitored by the test runner.
3. Verify that a failing regression test correctly blocks the build.
4. Verify that `assertStateInvariants` is included in the regression template.
5. Example regression test for a mock bug passes.
6. Infrastructure is documented in the README.
Acceptance: First regression test can be written and runs as part of the suite.

---
