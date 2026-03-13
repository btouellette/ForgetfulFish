# Rules Engine Implementation: Phase 1 — Turn loop + priority + basic commands

Status: complete

### [x] P1.1 — PriorityState type and priority engine

**Files**: `state/priorityState.ts`, `engine/kernel.ts` (start)

Define:
- `PriorityState { activePlayerPassed: boolean; nonActivePlayerPassed: boolean; playerWithPriority: PlayerId }`
- `givePriority(state: GameState, to: PlayerId): GameState`
- `handlePassPriority(state: GameState, player: PlayerId): GameState | 'both_passed'`
  - If only one player passed → update state, give priority to other player
  - If both passed → return `'both_passed'` signal for stack/phase advancement

**Test file**: `test/state/priorityState.test.ts`
Depends: P0.3
Test: **Write tests FIRST**, then implement.
1. Active player passes → non-active gets priority.
2. Both pass on empty stack → returns `'both_passed'` signal.
3. Non-active passes after active → returns `'both_passed'`.
4. Priority initialization correctly sets the active player.
5. Giving priority to a player updates the `playerWithPriority` field.
6. Passing priority resets the `passed` flag for that player.
Acceptance: Priority transitions are correct per §4 rules.

### [x] P1.2 — Phase/step sequencing

**Files**: `engine/kernel.ts` (extend)

Implement turn structure per §4:
- Phase/step enum: BEGINNING (untap, upkeep, draw), MAIN_1, COMBAT (begin_combat, declare_attackers, declare_blockers, combat_damage, end_combat), MAIN_2, ENDING (end, cleanup)
- `advanceStep(state: GameState): GameState` — moves to next step, handles:
  - Untap step: untap all permanents controlled by active player, no priority
  - Draw step: active player draws (skip on first turn of game for starting player)
  - Main phases: give priority to active player
  - Combat steps: give priority where applicable
  - Cleanup: discard to hand size, remove "until end of turn" effects, normally no priority
- `advanceTurn(state: GameState): GameState` — swap active player, reset per-turn state

<!-- TODO: First-turn draw skip — confirm the Forgetful Fish rule in docs/overview/open-questions.md. Standard MTG skips the starting player's first draw, but this variant decision is not yet recorded as canonical. -->

**Test file**: `test/engine/kernel.test.ts`
Depends: P0.3, P1.1
Test: **Write tests FIRST**, then implement.
1. Walk through a full turn cycle with both players always passing → every phase/step visited in order.
2. Untap step untaps a tapped permanent controlled by the active player.
3. Draw step adds a card to the active player's hand.
4. Turn advance swaps the active player and resets `landPlayedThisTurn`.
5. First turn of the game correctly skips the draw step for the starting player.
6. Cleanup step removes expired "until end of turn" effects.
Acceptance: Full turn cycle works with trivial (pass-only) game flow.

### [x] P1.3 — Draw command implementation

**Files**: `engine/processCommand.ts` (extend), `engine/kernel.ts` (extend)

Implement drawing:
- `drawCard(state: GameState, playerId: PlayerId, rng: Rng): { state: GameState; events: GameEvent[] }`
- Resolve draw source via `mode.resolveZone(state, 'library', playerId)`, remove top card from that zone, add to player's hand zone
- Update object's zone and owner (via `GameMode.determineOwner`)
- Bump `zcc`, store LKI snapshot
- Emit `CARD_DRAWN` event
- Handle empty library → player loses (SBA will catch this, but draw itself should still work)

**Test file**: `test/engine/draw.test.ts`
Depends: P0.3, P0.4, P0.5, P0.7, P0.10
Test: **Write tests FIRST**, then implement.
1. Draw from library with 5 cards → hand gains 1, library loses 1, correct card identity.
2. Draw emits `CARD_DRAWN` event with correct `playerId` and `cardId`.
3. Object's zone updated to hand, `zcc` is incremented.
4. LKI snapshot is stored for the pre-draw state of the card.
5. Draw from a 1-card library (edge case) results in empty library.
6. Multiple sequential draws correctly advance the library.
7. Draw when hand is already at maximum (no immediate discard, handled in cleanup).
8. `assertStateInvariants` passes after draw.
Acceptance: Draw is invoked via the turn structure and produces the behavior described in tests when run in an end-to-end game flow, including a split-zone mode conformance test that requires no kernel changes.

### [x] P1.4 — Play land command

**Files**: `engine/processCommand.ts` (extend), `commands/validate.ts`

Implement `PLAY_LAND` command:
- Validation in `validate.ts`:
  - Card is in player's hand
  - Player hasn't played a land this turn (`turnState.landPlayedThisTurn`)
  - It's a main phase, stack is empty, player has priority
- Execution: move card from hand to battlefield, set `landPlayedThisTurn = true`
- Emit `ZONE_CHANGE` event
- Bump zcc, update zones

**Test file**: `test/engine/land.test.ts`
Depends: P0.3, P0.9, P0.10, P1.1
Test: **Write tests FIRST**, then implement.
1. Play Island from hand → battlefield has Island, hand shrinks, `landPlayedThisTurn` set to true.
2. Second land play in the same turn → rejected (validation fails).
3. Play land during combat phase → rejected.
4. Play land when it is not your priority → rejected.
5. Play land when stack is not empty → rejected.
6. `assertStateInvariants` passes after land play.
Acceptance: Land plays work, validation catches all illegal attempts.

### [x] P1.5 — Mana payment (basic lands + special lands)

**Files**: `engine/kernel.ts` (extend), `actions/action.ts` (extend if needed)

Implement mana system:
- `ManaPool` type: `{ W: number; U: number; B: number; R: number; G: number; C: number }`
- `tapForMana(state: GameState, objectId: ObjectId): { state: GameState; events: GameEvent[] }`
  - Tap the permanent, add mana to controller's pool
  - Mana abilities don't use the stack (per MTG rules)
- `payManaCost(state: GameState, playerId: PlayerId, cost: ManaCost): GameState | 'insufficient'`
  - Deduct from pool, return new state or fail

<!-- TODO: Special lands mana abilities — Izzet Boilerworks taps for {U}{R}, Svyelunite Temple taps for {U}, sacrifice for {U}{U}. These are activated abilities but mana abilities don't use the stack. Define how these interact with the activation system. Also: Lonely Sandbar/Remote Isle have cycling (activated, not mana). Define the distinction clearly in the ActivatedAbilityAst. -->

**Test file**: `test/engine/mana.test.ts`
Depends: P0.3, P0.8, P0.11
Test: **Write tests FIRST**, then implement.
1. Tap Island → pool gains 1 blue, Island becomes tapped.
2. Pay {U} with 1 blue in pool → pool is empty, success signal.
3. Pay {U} with an empty pool → returns 'insufficient'.
4. Tap an already-tapped land for mana → rejected.
5. Deducting mana updates `PlayerInfo.manaPool` correctly.
6. Tapping non-land for mana → rejected.
Acceptance: Mana generation and payment work for Island.

### [x] P1.6 — Cast spell basics (put on stack + basic resolve)

**Files**: `engine/processCommand.ts` (extend), `stack/stackItem.ts`, `stack/resolve.ts`

Implement basic spell casting per §4/§6:
- `StackItem` type: `{ id: StackItemId; object: ObjectRef; controller: PlayerId; targets: ResolvedTarget[]; effectContext: EffectContext }`
- `CAST_SPELL` command handling:
  1. Validate: card in hand, enough mana, legal targets (if any)
  2. Move card from hand to stack zone
  3. Pay mana cost
  4. Create `StackItem` with initial `EffectContext`
  5. Emit `SPELL_CAST` event
  6. Give priority to active player (opponent can respond)
- Basic resolution (when both pass on non-empty stack):
  1. Pop top stack item
  2. Run resolution steps (via whiteboard — simplified in this phase)
  3. Move card to appropriate zone (battlefield for permanents; for instants/sorceries route graveyard via `mode.resolveZone(state, 'graveyard', ownerOrController)` per card/rules semantics)
  4. Emit `SPELL_RESOLVED` event

**Test file**: `test/engine/cast.test.ts`
Depends: P0.3, P0.5, P0.8, P0.9, P0.10, P1.1, P1.5
Test: **Write tests FIRST**, then implement.
1. Cast a real 1-mana instant fixture (prefer **Mental Note**) → moves to stack, mana is deducted from pool.
2. Both players pass priority → spell resolves, moves to graveyard.
3. Cast a creature card → resolves and moves to the battlefield.
4. Cast with insufficient mana → command rejected.
5. Opponent responds to spell on stack → opponent's spell resolves first.
6. `assertStateInvariants` passes after cast and after resolution.
Acceptance: Spell lifecycle (hand → stack → resolve → destination) works end-to-end and passes the same assertions under SharedDeckMode and split-zone test mode.

### [x] P1.7 — Legal command generation

**Files**: `commands/validate.ts` (extend)

Implement per §4:
- `getLegalCommands(state: GameState): Command[]`
  - If `pendingChoice` exists → only `MAKE_CHOICE` with valid payloads
  - Otherwise, for player with priority:
    - `PASS_PRIORITY` (always legal)
    - `PLAY_LAND` for each land in hand (if main phase, stack empty, haven't played one)
    - `CAST_SPELL` for each castable card in hand (enough mana, valid targets exist)
    - `ACTIVATE_ABILITY` for each activatable ability on controlled permanents
    - `CONCEDE` (always legal)
  - During combat: `DECLARE_ATTACKERS`, `DECLARE_BLOCKERS` as appropriate

**Test file**: `test/commands/legal.test.ts`
Depends: P0.3, P0.9, P1.1, P1.4, P1.5, P1.6
Test: **Write tests FIRST**, then implement.
1. Empty battlefield, Island in hand, main phase → legal commands include PLAY_LAND and PASS_PRIORITY.
2. No cards in hand, all lands tapped → only PASS_PRIORITY and CONCEDE are legal.
3. `pendingChoice` exists → only `MAKE_CHOICE` is returned as legal.
4. Opponent's turn → current player has no legal commands until given priority.
5. In COMBAT phase steps → `DECLARE_ATTACKERS` or `DECLARE_BLOCKERS` correctly appearing.
6. `assertStateInvariants` holds for all states checked.
Acceptance: Legal commands accurately reflect game state.

### [x] P1.8 — Minimal SBA loop

**Files**: `engine/sba.ts`

Implement minimal state-based actions per §4:
- `checkSBAs(state: GameState): SBAResult[]`
  - Creature with 0 or less toughness → destroy (move to graveyard)
  - Player with 0 or less life → that player loses
  - Player who attempted to draw from empty library → that player loses
- `applySBAs(state: GameState, sbas: SBAResult[]): { state: GameState; events: GameEvent[] }`
  - Apply all simultaneously
- SBA loop integration in kernel: after any game action, run SBA check repeatedly until no more SBAs found (fixed-point per §4)

<!-- TODO: Empty library loss — MTG rule 704.5b says "a player who was required to draw but couldn't loses." This is checked as an SBA, not at draw time. Verify the draw implementation (P1.3) correctly sets a flag or the SBA directly checks library size + draw attempt. -->

**Test file**: `test/engine/sba.test.ts`
Depends: P0.2, P0.3, P0.5
Test: **Write tests FIRST**, then implement.
1. Creature with 0 toughness in battlefield → destroyed and moved to graveyard by SBA.
2. Player reduced to 0 life → player status updated to lost via SBA.
3. SBA loop terminates correctly when no further SBAs apply.
4. Two different SBAs occurring simultaneously → both applied in the same cycle.
5. State before and after SBA cycle passes `assertStateInvariants`.
6. SBAs do not trigger if no conditions are met.
Acceptance: SBA loop is deterministic and reaches a fixed point.

### [x] P1.9 — EventBus (trigger scanning infrastructure)

**Files**: `events/eventBus.ts`

Implement event emission and trigger scanning infrastructure:
- `emitEvents(state: GameState, events: GameEvent[]): GameState`
  - Scan all permanents with `triggeredAbilities` for matching event types
  - Collect matching triggers into `state.triggerQueue`
  - (Actual trigger ordering/stacking deferred to Phase 4)
- Initially: just the scan infrastructure, no triggers to find yet

**Test file**: `test/events/eventBus.test.ts`
Depends: P0.2, P0.3, P0.5
Test: **Write tests FIRST**, then implement.
1. Emit `ZONE_CHANGE` event when no triggered abilities exist → `triggerQueue` remains empty.
2. Infrastructure correctly iterates over `objectPool` and checks `triggeredAbilities` fields.
3. Emit multiple events → infrastructure scans for triggers against all emitted events.
4. Event emission pipeline correctly updates `GameState.id` (versioning).
5. `assertStateInvariants` passes after event emission.
6. No side effects when scanning for non-existent triggers.
Acceptance: Event emission pipeline exists, ready for triggers.

### [x] P1.10 — Integration test: full turn with Island

Wire everything together:
- Set up game via mode-provided zone initialization: 2 players, active draw zone seeded with 20 Islands
- Player 1's turn: untap → upkeep → draw → main phase → play Island → tap Island for mana (pool has {U}) → pass → opponent passes → next phase → ... → end turn
- Player 2's turn: draw → play Island → pass through
- Verify: correct events emitted at each step, state consistent throughout

**Test file**: `test/integration/turn-cycle.test.ts`
Depends: all P1 tasks
Test: **Write tests FIRST**, then implement.
1. Verify `untap` step correctly untaps all permanents.
2. Verify `draw` step adds exactly one card to the active player's hand.
3. `play land` updates battlefield and hand correctly.
4. Priority passes between players work according to engine rules.
5. Phase/step transitions follow the MTG turn structure correctly.
6. `assertStateInvariants(state)` is called after every command and step transition.
7. Correct sequence of events is captured in the event log.
Acceptance: A full two-turn game cycle with only Islands works correctly end-to-end.

---
