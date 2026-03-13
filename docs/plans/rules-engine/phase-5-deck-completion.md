# Rules Engine Implementation: Phase 5 — Full deck completion + complex cards

Status: planned

### [ ] P5.1 — Card: Diminishing Returns

**Files**: `cards/diminishing-returns.ts`

Cards: **Diminishing Returns** (exile hand and graveyard, shuffle library, draw 7, lose 1 life)

Implement:
- CardDefinition: sorcery, {2}{U}{U}, `onResolve`:
  - Each player exiles their hand (to exile zone)
- Exile graveyard zone resolved by `mode.resolveZone(state, 'graveyard', casterId)`
  - Shuffle shared library
  - Each player draws 7 (alternating per `GameMode.simultaneousDrawOrder`)
  - Each player loses 1 life

**Test file**: `test/cards/diminishingReturns.test.ts`
Depends: P0.6, P0.7, P0.11, P2.1, P1.3
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 4-mana blue sorcery.
2. (Resolution) Both players' hands are moved to the exile zone.
3. (Resolution) The shared graveyard is moved to the exile zone.
4. (Resolution) The shared library is shuffled.
5. (Resolution) Both players draw 7 cards in alternating order.
6. (Resolution) The caster (and only the caster) loses 1 life.
7. (Shared-deck) All zone operations target the common library/graveyard.
8. (State) `assertStateInvariants` passes after the massive multi-zone state change.
Acceptance: Complex multi-zone card works with shared-deck hooks.

### [ ] P5.2 — Card: Supplant Form

**Files**: `cards/supplant-form.ts`

Cards: **Supplant Form** (return creature to hand, create token copy)

Implement:
- CardDefinition: instant, {4}{U}{U}, `onResolve`:
  - Step 0: `MOVE_ZONE` target creature from battlefield to owner's hand (bounce)
  - Step 1: `CREATE_TOKEN` — create a token that's a copy of the bounced creature

Requires Layer 1 copy effects:
- Token copies all characteristics of the original (as it last existed on battlefield via LKI)
- Layer 1 sets the base characteristics of the token to match the copied creature

**Test file**: `test/cards/supplantForm.test.ts`
Depends: P0.4 (LKI), P0.11, P2.1, P3.2
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 6-mana blue instant.
2. (Resolution) Target creature is returned to its owner's hand.
3. (Resolution) A new token object is created in the battlefield zone.
4. (Resolution) Token has identical `cardDefId`, P/T, and abilities as the original.
5. (Layer 1) Token's base characteristics match the LKI snapshot of the target.
6. (Interaction) Bouncing a token results in the token ceasing to exist (SBA).
7. (Interaction) Supplant Form on a Dandan results in a 4/1 Dragon (if Mind Bent).
8. (State) `assertStateInvariants` passes after token creation.
Acceptance: Bounce + token copy works, Layer 1 correctly applies.

### [ ] P5.3 — Layer 1: copy effects

**Files**: `effects/continuous/layers.ts` (extend)

Implement Layer 1 for copy effects:
- Copy effect sets the base characteristics of an object to match the copied object
- Applied first (before all other layers)
- Used by Supplant Form token copy
- Token base = copied creature's characteristics (from LKI or current state)

**Test file**: `test/effects/continuous/copy.test.ts`
Depends: P3.2, P0.4
Test: **Write tests FIRST**, then implement.
1. Layer 1 effect correctly overwrites the base characteristics of the target object.
2. Layer 1 is always applied before Layer 2-7.
3. Copying an object with existing continuous effects copies its *current* view (LKI or current).
4. Multiple copy effects are handled via timestamp.
5. Token objects correctly store their Layer 1 base data.
6. `computeGameObject` correctly starts with the Layer 1 result.
Acceptance: Layer 1 copy is correctly ordered before other layers.

### [ ] P5.4 — Card: Metamorphose

**Files**: `cards/metamorphose.ts`

Cards: **Metamorphose** (counter target permanent spell, its controller draws a card... actually: put target permanent on top of library, its controller draws a card)

**Test file**: `test/cards/metamorphose.test.ts`
Depends: P0.6, P0.7, P0.11, P2.1
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads with correct ID and type.
2. (Casting) Targets a permanent on the battlefield.
3. (Resolution) Targeted permanent is moved to the top of the shared library.
4. (Resolution) Target permanent's controller reveals cards from library top until a permanent is found.
5. (Resolution) Revealed permanent is put onto the battlefield.
6. (Resolution) Remaining revealed cards are shuffled back into the shared library.
7. (Shared-deck) Reveal and shuffle correctly use the common zones.
8. (State) `assertStateInvariants` passes after complex cascade resolution.
Acceptance: Matches Oracle text behavior with shared-deck semantics.

### [ ] P5.5 — Card: Unsubstantiate

**Files**: `cards/unsubstantiate.ts`

Cards: **Unsubstantiate** (return target spell or creature to hand)

Implement:
- CardDefinition: instant, {1}{U}, `onResolve`:
  - `MOVE_ZONE` target from battlefield or stack to owner's hand
  - Can target: creature on battlefield OR spell on stack (modal targeting)

**Test file**: `test/cards/unsubstantiate.test.ts`
Depends: P0.11, P2.1
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 2-mana blue instant.
2. (Casting) Can target a creature on the battlefield.
3. (Casting) Can target a spell currently on the stack.
4. (Resolution) Target creature is returned to hand correctly.
5. (Resolution) Target spell is returned to hand (countering it).
6. (Interaction) Spell returned to hand has its `zcc` incremented.
7. (Edge case) Targeting a land on the battlefield is rejected.
8. (State) `assertStateInvariants` passes after hand-return.
Acceptance: Dual-mode bounce works for both battlefield creatures and stack spells.

### [ ] P5.6 — Card: Vision Charm

**Files**: `cards/vision-charm.ts`

Cards: **Vision Charm** (modal: mill 4 / make artifact a type until EOT / phase out target)

Implement:
- CardDefinition: instant, {U}, `onResolve`:
  - Mode choice: `PendingChoice { type: 'CHOOSE_MODE'; modes: [mill, typeChange, phaseOut] }`
  - Mode 1: mill top 4 of target player's library → graveyard (shared library in variant)
  - Mode 2: choose artifact, choose basic land type, artifact becomes that type until EOT
  - Mode 3: target permanent phases out

**Test file**: `test/cards/visionCharm.test.ts`
Depends: P0.6, P0.7, P0.11, P2.1, P2.2
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 1-mana blue instant.
2. (Resolution) Player is offered a choice of 3 modes.
3. (Mode 1) Exactly 4 cards move from library to shared graveyard.
4. (Mode 2) Artifact permanent gains a basic land type until end of turn.
5. (Mode 3) Targeted permanent is marked as "phased out" and treated as non-existent.
6. (Shared-deck) Mill uses the common library zone.
7. (Interaction) Phased out permanent returns during its owner's next untap step.
8. (State) `assertStateInvariants` passes after each mode's resolution.
Acceptance: All three modes work.

### [ ] P5.7 — Card: Mystic Retrieval

**Files**: `cards/mystic-retrieval.ts`

Cards: **Mystic Retrieval** (return instant/sorcery from graveyard to hand; flashback {2}{R})

Implement:
- CardDefinition: sorcery, {3}{U}, `onResolve`:
  - `CHOOSE_CARDS { candidates: instants/sorceries in graveyard; min: 1; max: 1 }`
  - `MOVE_ZONE` chosen card from graveyard to hand
- Flashback: `{ cost: { C: 2, R: 1 }; zone: 'graveyard' }`
  - Can be cast from graveyard for flashback cost
  - If cast via flashback, exile instead of going to graveyard after resolution

**Test file**: `test/cards/mysticRetrieval.test.ts`
Depends: P0.7, P0.11, P2.1, P2.2, P2.5 (replacement for exile-on-resolve)
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as sorcery with flashback cost.
2. (Casting) Normal cast from hand works with {3}{U}.
3. (Flashback) Flashback cast from graveyard works with {2}{R}.
4. (Resolution) One instant/sorcery returns from shared graveyard to hand.
5. (Interaction) If cast via flashback, card moves to exile upon resolution.
6. (Interaction) Flashback uses the same `onResolve` logic as normal cast.
7. (Shared-deck) Accesses the common graveyard for targets.
8. (State) `assertStateInvariants` holds after graveyard retrieval.
Acceptance: Both normal cast and flashback work with shared-deck graveyard.

### [ ] P5.8 — Cards: Cycling lands (Lonely Sandbar, Remote Isle)

**Files**: `cards/lonely-sandbar.ts`, `cards/remote-isle.ts`

Cards: **Lonely Sandbar** (cycling {U}), **Remote Isle** (cycling {U})

Implement:
- Both are lands that enter tapped and tap for {U}
- Activated ability: cycling {U} — discard this card (from hand), draw a card
- Cycling is an activated ability from hand, not from battlefield
- Uses the stack (it's not a mana ability)

**Test file**: `test/cards/cyclingLands.test.ts`
Depends: P0.11, P1.5, P2.1
Test: **Write tests FIRST**, then implement.
1. (Definition) Load as lands that enter tapped.
2. (Casting) Play as land correctly updates battlefield.
3. (Activated) Cycling ability can be activated while in hand.
4. (Resolution) Cycling results in discarding the land and drawing 1 card.
5. (Shared-deck) Draw correctly pulls from common library.
6. (Interaction) Cycling cannot be activated if the card is on the battlefield.
7. (Interaction) Cycling can be countered (as it uses the stack).
8. (State) `assertStateInvariants` passes after cycling resolution.
Acceptance: Both cycling modes work (play as land, cycle from hand).

### [ ] P5.9 — Card: Svyelunite Temple

**Files**: `cards/svyelunite-temple.ts`

Cards: **Svyelunite Temple** (enters tapped, {T}: add {U}, sacrifice: add {U}{U})

Implement:
- CardDefinition: land, enters tapped
- Mana ability 1: `{T}: Add {U}`
- Activated ability: sacrifice Svyelunite Temple: Add {U}{U} (this IS a mana ability since it produces mana)

**Test file**: `test/cards/svyeluniteTemple.test.ts`
Depends: P0.11, P1.5
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as land that enters tapped.
2. (Casting) Play as land correctly updates battlefield.
3. (Mana) Tap adds {U} to mana pool immediately.
4. (Mana) Sacrifice adds {U}{U} to mana pool immediately.
5. (Interaction) Sacrificing moves the temple to the shared graveyard.
6. (Interaction) Mana abilities do not use the stack and cannot be responded to.
7. (Interaction) Sacrifice ability can be used even if tapped (as long as sacrifice is the cost).
8. (State) `assertStateInvariants` passes after mana generation.
Acceptance: Both mana abilities work, sacrifice is a mana ability (doesn't use stack).

### [ ] P5.10 — ETB lookahead (if needed)

**Files**: `effects/replacement/etbLookahead.ts`

Implement per §16 if any card in the deck requires CR 614.12 semantics:
- `previewEnterBattlefield(state, enteringObject, destination): EnterPreview`
- Creates hypothetical view of object on battlefield
- Determines applicable replacement effects and ETB triggers

**Test file**: `test/effects/replacement/etbLookahead.test.ts`
Depends: P3.2, P2.5
Test: **Write tests FIRST**, then implement.
1. Entering object's hypothetical view is correctly computed.
2. Replacement effects that modify entering (e.g., "enters tapped") are identified.
3. ETB triggers that depend on object characteristics are correctly flagged.
4. `previewEnterBattlefield` does not mutate the current game state.
Acceptance: Stub exists at minimum; full implementation only if deck requires it.

### [ ] P5.11 — Full dependency resolution expansion

**Files**: `effects/continuous/dependency.ts` (extend if needed)

Expand dependency resolution beyond Layer 3 if card interactions demand it:
- Layer 2 dependency (unlikely in this deck)
- Layer 4 dependency (possible with Dance of the Skywise + type interactions)
- Layer 6 dependency (possible with ability grants that depend on types)

**Test file**: `test/effects/continuous/dependency_complex.test.ts`
Depends: P3.5, P3.14
Test: **Write tests FIRST**, then implement.
1. Verify cross-layer dependency (e.g., Layer 4 affecting Layer 6).
2. Verify dependency ordering remains stable with multiple concurrent effects.
3. Verify that removing an effect correctly updates the dependency graph.
4. Circular dependency detection and resolution (timestamp fallback).
Acceptance: All deck interactions with dependency are covered.

### [ ] P5.12 — Integration test: remaining cards

Test all remaining cards not covered by prior integration tests:
- Diminishing Returns with shared graveyard (full scenario)
- Supplant Form on Dandan (bounce + copy)
- Vision Charm each mode
- Mystic Retrieval flashback from graveyard
- Cycling lands cycle + play

**Test file**: `test/integration/full-deck.test.ts`
Depends: all P5 tasks
Test: **Write tests FIRST**, then implement.
1. (Diminishing Returns) Full scenario with both players having hands and a full graveyard.
2. (Supplant Form) Bounce a creature with active continuous effects and verify the token.
3. (Vision Charm) Verify all three modes work in a single test suite.
4. (Mystic Retrieval) Verify flashback cost and exile replacement.
5. (Cycling) Cycle multiple lands in a single turn and verify library depletion.
6. `assertStateInvariants(state)` called after every resolution.
7. Every one of the 23 unique cards loads, casts, resolves, and behaves correctly.
Acceptance: Every one of the 23 unique cards loads, casts, resolves, and behaves correctly.

### [ ] P5.13 — Deck bootstrap API + deck-driven smoke tests

Add explicit deck bootstrap support so integration tests can initialize game state from deck definitions instead of manual zone seeding.

**Files**: `state/deckBootstrap.ts` (new), `state/gameState.ts` (extend API), `test/integration/deck-smoke.test.ts` (new)

Implement:
- `DeckDefinition` input shape for deterministic test fixtures (minimum: card IDs + counts)
- `createInitialGameStateFromDecks(...)` (or equivalent) that:
  - builds `objectPool` from deck definitions
  - populates library zones through `GameMode.resolveZone(...)`
  - supports deterministic opening draws from seeded RNG
- Shared-deck baseline fixture (`20x Island` vs `20x Island`) plus one mixed-card fixture
- Test driver usage that issues only external commands (`processCommand` / `getLegalCommands`) during smoke tests

**Test file**: `test/integration/deck-smoke.test.ts`
Depends: P0.6, P0.7, P1.3, P1.4, P1.7, P5.12
Test: **Write tests FIRST**, then implement.
1. Deck-defined shared-library game initializes without direct zone mutation in test setup.
2. Opening draws come from deck/bootstrap API and are deterministic for a fixed seed.
3. Baseline smoke (`20x Island` vs `20x Island`) supports draw, land play, mana activation, and pass-priority progression.
4. Mixed fixture smoke verifies legal-command generation does not throw on deck-loaded objects.
5. `assertStateInvariants(state)` passes after every command in smoke scenarios.
6. Smoke tests avoid direct mutation of `state.zones`, `state.objectPool`, and `state.turnState`.
Acceptance: Deck-driven smoke tests validate real initialization path and command-only gameplay flow.

---
