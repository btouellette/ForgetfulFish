# Rules Engine Implementation: Phase 2 — Stack resolution + whiteboard + choices + action pipeline

Status: complete

### [x] P2.1 — EffectContext, Whiteboard, and ResolutionCursor

**Files**: `stack/stackItem.ts` (extend), `actions/whiteboard.ts`

Flesh out per §6:
- `ResolutionCursor`: `{ kind: 'start' } | { kind: 'step'; index: number } | { kind: 'waiting_choice'; choiceId: string } | { kind: 'done' }`
- `EffectContext { stackItemId; source; controller; targets; cursor; whiteboard }`
- `Whiteboard { actions: GameAction[]; scratch: Record<string, unknown> }`
- Helpers: `advanceCursor(ctx: EffectContext): EffectContext`, `writeToScratch(ctx, key, value)`, `readFromScratch(ctx, key)`

**Test file**: `test/stack/stackItem.test.ts`
Depends: P0.1, P0.8, P1.6
Test: **Write tests FIRST**, then implement.
1. Create `EffectContext` with cursor at 'start', advance correctly to step 0.
2. `writeToScratch` and `readFromScratch` round-trip data correctly.
3. Cursor at 'waiting_choice' preserves the current `whiteboard` state perfectly.
4. `advanceCursor` increments step index correctly.
5. Whiteboard actions array can be populated and retrieved.
6. Multiple different data types are handled by `scratch` Record.
Acceptance: Context persists across simulated choice interruptions.

### [x] P2.2 — PendingChoice system

**Files**: `choices/pendingChoice.ts`

Define per §11:
- `PendingChoice { id: ChoiceId; type: ChoiceType; forPlayer: PlayerId; prompt: string; constraints: ChoiceConstraints }`
- `ChoiceType`: `CHOOSE_CARDS | CHOOSE_TARGET | CHOOSE_MODE | CHOOSE_YES_NO | ORDER_CARDS | ORDER_TRIGGERS | CHOOSE_REPLACEMENT | NAME_CARD`
- `ChoiceConstraints` per type:
  - `CHOOSE_CARDS`: `{ candidates: ObjectId[]; min: number; max: number; filter?: CardFilter }`
  - `ORDER_CARDS`: `{ cards: ObjectId[] }`
  - `ORDER_TRIGGERS`: `{ triggers: TriggeredAbilityId[] }`
  - `NAME_CARD`: `{}` (any valid card name)
  - `CHOOSE_REPLACEMENT`: `{ replacements: ReplacementId[] }`
  - `CHOOSE_MODE`: `{ modes: Mode[] }`
  - `CHOOSE_TARGET`: `{ targetConstraints: TargetConstraint }`
  - `CHOOSE_YES_NO`: `{ prompt: string }`

<!-- TODO: Define `ChoiceConstraints` discriminated union exhaustively. Each choice type has different constraint shapes. Also define corresponding `ChoicePayload` variants that validate against constraints. -->

**Test file**: `test/choices/pendingChoice.test.ts`
Depends: P0.1, P0.9
Test: **Write tests FIRST**, then implement.
1. Construct each of the 8 `PendingChoice` types with valid constraints.
2. `ChoiceConstraints` union is correctly discriminated in validation logic.
3. `playerId` field correctly identifies who must make the choice.
4. `prompt` string is correctly stored and retrieved.
5. Constraints for `CHOOSE_CARDS` correctly enforce `min`/`max`.
6. `ORDER_CARDS` constraints contain the required card IDs.
Acceptance: Types compile, all 8 choice types have defined constraints.

### [x] P2.3 — MAKE_CHOICE command handling and choice resumption

**Files**: `choices/resume.ts`, `engine/processCommand.ts` (extend)

Implement per §11 re-entry model:
- On `MAKE_CHOICE` command:
  1. Verify `state.pendingChoice` exists and matches the choice being answered
  2. Validate payload against `PendingChoice.constraints`
  3. Load `EffectContext` from the top-of-stack item
  4. Write choice results into `whiteboard.scratch`
  5. Advance cursor to next resolution step
  6. Continue resolution from new cursor position
  7. Clear `pendingChoice` from state
- If resolution hits another choice point → set new `pendingChoice`, return

**Test file**: `test/choices/resume.test.ts`
Depends: P2.1, P2.2, P1.6
Test: **Write tests FIRST**, then implement.
1. Spell resolution paused at a choice point returns a `pendingChoice`.
2. `MAKE_CHOICE` with a valid payload resumes resolution from the correct step.
3. Resuming resolution does not re-run previously executed steps.
4. `MAKE_CHOICE` with an invalid payload (e.g., too many cards) is rejected.
5. `MAKE_CHOICE` when no `pendingChoice` exists is rejected.
6. `assertStateInvariants` holds after choice resumption.
Acceptance: Multi-step resolution with choices works without double-application.

### [x] P2.4 — Action Modifier Pipeline

**Files**: `actions/pipeline.ts`

Implement per §7:
- 4-stage pipeline: `rewrite → filter → redirect → augment`
- `runPipeline(state: GameState, actions: GameAction[]): GameAction[]`
  - **Rewrite stage**: apply replacement effects (replacement registry from P2.5)
  - **Filter stage**: remove actions with illegal targets, remove actions blocked by indestructible etc.
  - **Redirect stage**: modify action targets (damage redirection, etc.)
  - **Augment stage**: add derived actions (rare — mostly handled by triggers)
- Apply-once tracking: each action carries `appliedReplacements`; skip already-applied

Initially: pipeline exists but rewrite/redirect/augment stages are no-ops. Filter stage checks basic target legality.

**Test file**: `test/actions/pipeline.test.ts`
Depends: P0.8, P2.1
Test: **Write tests FIRST**, then implement.
1. Actions with valid targets pass through the pipeline unchanged.
2. Action targeting an object that has changed zones (stale reference) is filtered out.
3. Pipeline returns a new array and does not mutate the input array.
4. Empty input actions array returns an empty output array.
5. Multiple actions in a single pipeline call are processed independently.
6. Target legality check handles both ObjectRefs and PlayerIds.
Acceptance: Pipeline infrastructure works, ready for replacement effects.

### [x] P2.5 — Replacement effect registry and apply-once tracking

**Files**: `effects/replacement/registry.ts`, `effects/replacement/applyOnce.ts`

Implement per §7:
- `ReplacementEffectDefinition { id: ReplacementId; appliesTo: ActionMatcher; rewrite: (action: GameAction, state: GameState) => GameAction; condition?: ConditionAst }`
- `ReplacementRegistry`: stores active replacement effects, queries by action type
- Apply-once logic:
  - Check `action.appliedReplacements` before applying
  - Append replacement ID after applying
  - Re-evaluate after each replacement (new action may match new replacements)
  - If multiple apply → affected player chooses (emit `PendingChoice` of type `CHOOSE_REPLACEMENT`)
  - Loop terminates when no unapplied replacements match

**Test file**: `test/effects/replacement/registry.test.ts`
Depends: P0.8, P2.2, P2.4
Test: **Write tests FIRST**, then implement.
1. Single replacement correctly rewrites an action and adds its ID to `appliedReplacements`.
2. A replacement effect does not re-apply to an action it already modified.
3. Two applicable replacements trigger a `PendingChoice` for the player to choose order.
4. The replacement loop terminates correctly without infinite re-application.
5. Replacement effect condition AST is correctly evaluated before applying.
6. Actions not matching any criteria pass through unchanged.
Acceptance: Replacement pipeline is sound with apply-once semantics.

### [x] P2.6 — Target validation with ObjectRef staleness

**Files**: `commands/validate.ts` (extend), `stack/resolve.ts` (extend)

Implement per §2:
- At spell/ability resolution time:
  - For each target `ObjectRef { id, zcc }`:
    - Look up object in `objectPool` by `id`
    - If object's current `zcc` !== target's `zcc` → target is stale (object changed zones)
    - Stale target = illegal target
  - If ALL targets are illegal → spell fizzles (doesn't resolve, goes to graveyard)
  - If SOME targets are illegal → resolve with remaining legal targets only

**Test file**: `test/commands/validate.test.ts`
Depends: P0.1, P0.2, P1.6
Test: **Write tests FIRST**, then implement.
1. Target still on battlefield with matching `zcc` is considered valid.
2. Target moved to graveyard (incremented `zcc`) is detected as stale and illegal.
3. A spell with all targets illegal "fizzles" (moves to graveyard, no effects occur).
4. A spell with 2 targets (1 legal, 1 illegal) resolves for the legal target only.
5. Validation correctly handles target disappearance from `objectPool`.
6. `assertStateInvariants` holds after a spell fizzles.
Acceptance: Fizzle rules match MTG CR 608.2b.

### [x] P2.7 — Card: Memory Lapse

**Files**: `cards/memory-lapse.ts`

Cards: **Memory Lapse** (counter target spell, put on top of library)

Implement per card-mechanism mapping:
- CardDefinition: instant, {1}{U}, `onResolve`:
  1. `COUNTER` action targeting the spell on the stack
  2. `MOVE_ZONE` action: countered spell → top of library (not graveyard)
- Resolution steps:
  - Step 0: counter target spell (via whiteboard `COUNTER` action)
  - Step 1: move countered spell to top of library (via `MOVE_ZONE` with `toIndex: 0`)
- Shared-deck interaction: "owner's library" routes via `mode.resolveZone(state, 'library', ownerId)` and resolves to shared library under SharedDeckMode

**Test file**: `test/cards/memoryLapse.test.ts`
Depends: P0.11, P2.1, P2.4, P1.6
Test: **Write tests FIRST**, then implement.
1. (Definition) Card loads with correct cost, type, and target constraints.
2. (Casting) Legal to cast targeting a spell on the stack.
3. (Resolution) Spell on stack is countered and moved to the top of the shared library.
4. (Shared-deck) Target spell moves to index 0 of the common library zone.
5. (Interaction) Memory Lapse itself moves to the shared graveyard after resolution.
6. (Edge case) Memory Lapse targeting its own caster's spell works correctly.
7. (Edge case) Memory Lapse fizzles if the target spell is countered/removed before resolution.
8. (State) `assertStateInvariants` passes after resolution.
Acceptance: Memory Lapse works per Oracle text with shared-deck semantics.

### [x] P2.8 — Card: Accumulated Knowledge

**Files**: `cards/accumulated-knowledge.ts`

Cards: **Accumulated Knowledge** (draw X where X = count in graveyards + 1)

Implement:
- CardDefinition: instant, {1}{U}, `onResolve`:
  - Step 0: count cards named "Accumulated Knowledge" in graveyard (shared graveyard — includes the AK about to resolve, which is still on stack, so count graveyard only)
  - Step 1: draw X+1 cards where X = that count
- Uses `mode.resolveZone(state, 'graveyard', playerId)` and resolves to shared graveyard under SharedDeckMode

<!-- TODO: Verify the count timing — when AK resolves, it's still on the stack, not in graveyard yet. So the count is of AKs already in graveyard. After resolution, AK itself goes to graveyard. This means first AK draws 1, second draws 2, etc. Confirm this matches Oracle text: "Draw a card, then draw a card for each card named Accumulated Knowledge in each graveyard." -->

**Test file**: `test/cards/accumulatedKnowledge.test.ts`
Depends: P0.11, P2.1, P1.3
Test: **Write tests FIRST**, then implement.
1. (Definition) Card loads with name "Accumulated Knowledge" and correct cost.
2. (Casting) Legal to cast when mana available.
3. (Resolution) First AK cast (0 in graveyard) draws exactly 1 card.
4. (Resolution) Second AK cast (1 in graveyard) draws exactly 2 cards.
5. (Shared-deck) Count correctly includes AKs from all players in the shared graveyard.
6. (Edge case) AK doesn't count itself during resolution (as it is on the stack).
7. (Edge case) AK works correctly when library has fewer cards than requested draw.
8. (State) `assertStateInvariants` passes after all draws completed.
Acceptance: Count is correct and uses shared graveyard.

### [x] P2.9 — Card: Brainstorm

**Files**: `cards/brainstorm.ts`

Cards: **Brainstorm** (draw 3, put 2 back on top in order)

Implement per §6 multi-step resolution:
- CardDefinition: instant, {U}, `onResolve`:
  - Step 0: `DRAW` action ×3 from shared library
  - Step 1: Emit `PendingChoice { type: 'CHOOSE_CARDS'; candidates: hand; min: 2; max: 2 }`
  - Step 2 (after choice): Emit `PendingChoice { type: 'ORDER_CARDS'; cards: chosen2 }`
  - Step 3 (after ordering): `MOVE_ZONE` ×2 from hand to top of shared library in chosen order

Persisted context crucial here — cursor saves after each choice point.

<!-- TODO: Confirm whether the two put-back cards require two separate choices (which 2, then what order) or a single combined choice (pick 2 in order). MTG Oracle text: "Draw three cards, then put two cards from your hand on top of your library in any order." This suggests a single ORDER_CARDS choice where the player picks which 2 and their order simultaneously. May simplify to: CHOOSE_CARDS (pick 2 from hand) → ORDER_CARDS (arrange those 2). Two choices is cleaner for UI. -->

**Test file**: `test/cards/brainstorm.test.ts`
Depends: P0.11, P2.1, P2.2, P2.3, P1.3
Test: **Write tests FIRST**, then implement.
1. (Definition) Card loads as 1-mana blue instant.
2. (Resolution) Caster draws 3 cards immediately from shared library.
3. (Resolution) Caster receives `CHOOSE_CARDS` pending choice for exactly 2 cards.
4. (Resolution) After choosing, caster receives `ORDER_CARDS` for those 2 cards.
5. (Resolution) Chosen cards move to the top of the shared library in the specified order.
6. (Shared-deck) Verification that library top 2 are the expected cards.
7. (Interaction) Opponent sees draw events but not the specific card identities.
8. (State) `assertStateInvariants` passes after each step and choice resumption.
Acceptance: Multi-choice resolution works end-to-end, persisted context survives interruption.

### [x] P2.10 — Card: Mystical Tutor

**Files**: `cards/mystical-tutor.ts`

Cards: **Mystical Tutor** (search library for instant/sorcery, put on top)

Implement:
- CardDefinition: instant, {U}, `onResolve`:
  - Step 0: Emit `PendingChoice { type: 'CHOOSE_CARDS'; candidates: instants/sorceries in library; min: 0; max: 1 }`
  - Step 1 (after choice): `SHUFFLE` library
  - Step 2: `MOVE_ZONE` chosen card to top of library

<!-- TODO: Mystical Tutor Oracle text: "Search your library for an instant or sorcery card and reveal that card. Shuffle your library, then put the card on top of it." Resolution order is: search → reveal → shuffle → put on top. Steps above reflect this. Verify shared-deck semantics for "your library" via GameMode. -->

**Test file**: `test/cards/mysticalTutor.test.ts`
Depends: P0.6 (RNG for shuffle), P0.11, P2.1, P2.2, P2.3
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads with correct ID and instant type.
2. (Resolution) Choice is offered with all instant/sorcery cards in shared library as candidates.
3. (Resolution) Library is shuffled after the card is selected.
4. (Resolution) The selected card is placed on top (index 0) of the shuffled library.
5. (Shared-deck) Search correctly spans the entire common library.
6. (Edge case) Choosing 0 cards (failing to find) results only in a shuffle.
7. (Edge case) Casting with an empty library results in no choice and no error.
8. (State) `assertStateInvariants` passes after shuffle and placement.
Acceptance: Full search-shuffle-put-on-top sequence works.

### [x] P2.11 — Card: Predict

**Files**: `cards/predict.ts`

Cards: **Predict** (name a card, mill 2, if named card milled draw 2)

Implement per §6 multi-step:
- CardDefinition: instant, {1}{U}, `onResolve`:
  - Step 0: Emit `PendingChoice { type: 'NAME_CARD' }` — player names any Magic card
  - Step 1 (after name choice): Mill top 2 of shared library → shared graveyard
  - Step 2: Check if named card was among milled cards
  - Step 3: If yes, draw 2 cards

**Test file**: `test/cards/predict.test.ts`
Depends: P0.11, P2.1, P2.2, P2.3, P1.3
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 2-mana blue instant.
2. (Resolution) Player is prompted with `NAME_CARD` choice.
3. (Resolution) Top 2 cards move to shared graveyard (mill).
4. (Resolution) If the named card was milled, player draws 2 cards.
5. (Resolution) If named card was NOT milled, no cards are drawn.
6. (Shared-deck) Correct mill and draw from common library zone.
7. (Interaction) Named card is stored in `whiteboard.scratch` during resolution.
8. (State) `assertStateInvariants` passes after mill and after conditional draw.
Acceptance: Conditional draw works correctly based on named card match.

---
