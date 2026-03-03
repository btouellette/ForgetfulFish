# Rules Engine Implementation Plan

Granular task breakdown derived from `docs/RULES_ENGINE_ARCHITECTURE.md`. Each task is
numbered within its phase (e.g., P0.1, P0.2) and designed to be independently verifiable.
Tasks within a phase are ordered by dependency — earlier tasks unblock later ones.

**Conventions**
- File paths are relative to `packages/game-engine/src/`.
- "§N" references a section in `RULES_ENGINE_ARCHITECTURE.md`.
- `<!-- TODO: ... -->` marks items needing further clarification before implementation.
- "Cards:" lists which of the 23 unique cards a task unblocks.
- "Depends:" lists prerequisite tasks.
- "Test:" describes the minimum acceptance test.
- "Acceptance:" describes the concrete success condition beyond tests.

**Current baseline**: `packages/game-engine/` has `src/state.ts` (basic `PlayerState`,
`GameState` stub, `createInitialGameState`), `src/index.ts` (re-exports), and
`test/state.test.ts`. Everything below is greenfield.

---

## Phase 0 — Foundations (determinism + identity + mode)

### P0.1 — Core type definitions: ObjectRef, ObjectId, ZoneRef

**Files**: `state/objectRef.ts`, `state/zones.ts`

Define:
- `ObjectId` (string type alias)
- `ObjectRef { id: ObjectId; zcc: number }` per §2
- `ZoneRef` discriminated union: `{ zone: 'library' } | { zone: 'graveyard' } | { zone: 'battlefield' } | { zone: 'exile' } | { zone: 'stack' } | { zone: 'hand'; playerId: PlayerId }`
- `PlayerId` (string type alias)
- Zone-change helper: `bumpZcc(obj: GameObject): GameObject` — returns new object with incremented `zcc`

Depends: none
Test: Unit tests in `test/state/objectRef.test.ts` — construct `ObjectRef`, verify `bumpZcc` increments, `ZoneRef` union exhaustiveness check.
Acceptance: Types compile, tests pass, exported from `index.ts`.

### P0.2 — GameObject and GameObjectBase types

**Files**: `state/gameObject.ts`

Define per §1:
- `GameObjectBase { id: ObjectId; zcc: number; cardDefId: string; owner: PlayerId; controller: PlayerId; counters: Map<string, number>; damage: number; tapped: boolean; summoningSick: boolean; attachments: ObjectId[]; abilities: AbilityAst[]; zone: ZoneRef }`
- `GameObjectView` (derived/computed view — same shape, populated by layer system later)
- `GameObject = GameObjectBase` initially (view computation added in Phase 3)

<!-- TODO: Determine whether `abilities: AbilityAst[]` should live on GameObjectBase or only appear after card definition hydration. The architecture doc shows it on GameObject — verify this is the base copy, not just the derived view. -->

Depends: P0.1
Test: Unit tests constructing a `GameObject`, verifying all fields are accessible.
Acceptance: Types compile, exported.

### P0.3 — Full GameState type

**Files**: `state/gameState.ts` (new file replacing current `state.ts`)

Define the complete `GameState` per §1:
- `id`, `version`, `engineVersion`
- `rngSeed: string`
- `mode: GameMode` (interface reference, implemented in P0.7)
- `players: [PlayerInfo, PlayerInfo]` with `id`, `life`, `manaPool`, `hand: ObjectId[]`, `priority: boolean`
- `zones: { library, graveyard, battlefield, exile, stack }` — each `ObjectId[]`
- `objectPool: Map<ObjectId, GameObject>`
- `stack: StackItem[]` (type stub — fleshed out in Phase 2)
- `turnState: TurnState { activePlayerId, phase, step, priorityState, attackers, blockers, landPlayedThisTurn }`
- `continuousEffects: ContinuousEffect[]` (type stub — fleshed out in Phase 3)
- `pendingChoice: PendingChoice | null` (type stub — fleshed out in Phase 2)
- `lkiStore: Map<string, LKISnapshot>`
- `triggerQueue: TriggeredAbility[]` (type stub — fleshed out in Phase 4)

Migrate existing `createInitialGameState` to use the new types. Update existing test in
`test/state.test.ts` to match.

<!-- TODO: Define Phase and Step enums (UNTAP, UPKEEP, DRAW, MAIN_1, BEGIN_COMBAT, DECLARE_ATTACKERS, DECLARE_BLOCKERS, COMBAT_DAMAGE, END_COMBAT, MAIN_2, END, CLEANUP). Check whether a single Phase enum with Step sub-enum is cleaner or if flat enum is better for pattern matching. -->

Depends: P0.1, P0.2
Test: Construct a full `GameState`, verify all zone arrays empty, objectPool empty, players initialized.
Acceptance: Existing `state.test.ts` updated and passing with new types.

### P0.4 — LKI snapshot types and helpers

**Files**: `state/lki.ts`

Define per §2:
- `LKISnapshot { ref: ObjectRef; zone: ZoneRef; base: GameObjectBase; derived: GameObjectView }`
- `captureSnapshot(obj: GameObject, derivedView: GameObjectView, zone: ZoneRef): LKISnapshot`
- `lookupLKI(store: Map<string, LKISnapshot>, id: ObjectId, zcc: number): LKISnapshot | undefined`
- Key format: `"${id}:${zcc}"`

Depends: P0.1, P0.2
Test: Create object, capture snapshot, look up by id:zcc — found. Look up with wrong zcc — undefined.
Acceptance: Tests pass, exported.

### P0.5 — Event types and EventEnvelope

**Files**: `events/event.ts`

Define per §12:
- `EventEnvelope { engineVersion: string; schemaVersion: number; gameId: string }`
- `GameEventBase { id: string; seq: number }`
- `GameEventPayload` — discriminated union with all event types from §12:
  `CARD_DRAWN`, `ZONE_CHANGE`, `SPELL_CAST`, `ABILITY_TRIGGERED`, `ABILITY_ACTIVATED`,
  `SPELL_RESOLVED`, `SPELL_COUNTERED`, `DAMAGE_DEALT`, `LIFE_CHANGED`, `PRIORITY_PASSED`,
  `PHASE_CHANGED`, `PLAYER_LOST`, `SHUFFLED`, `CHOICE_MADE`, `RNG_CONSUMED`,
  `CONTINUOUS_EFFECT_ADDED`, `CONTINUOUS_EFFECT_REMOVED`, `CONTROL_CHANGED`
- `GameEvent = GameEventBase & GameEventPayload`
- Helper: `createEvent(envelope: EventEnvelope, seq: number, payload: GameEventPayload): GameEvent` — generates stable ID from `envelope.gameId` and `seq`

<!-- TODO: Decide on event ID format — UUID v4, or `${gameId}:${seq}`? Architecture doc says "stable unique ID" but doesn't specify format. Leaning toward `${gameId}:${seq}` since seq is already monotonic and unique within a game. The `envelope` parameter provides `gameId`. -->

Depends: P0.1 (needs ObjectRef, PlayerId, ZoneRef for event payloads)
Test: Construct one event of each type, verify discriminated union narrows correctly in switch.
Acceptance: All event types compile, exhaustiveness check via `never` in switch default.

### P0.6 — Seeded deterministic RNG

**Files**: `rng/rng.ts`

Implement per §15:
- `Rng` class/object with:
  - Constructor from seed string
  - `next(): number` — returns value in [0, 1), advances internal state
  - `nextInt(min: number, max: number): number` — inclusive range
  - `shuffle<T>(arr: T[]): T[]` — Fisher-Yates, returns new array
  - `getSeed(): string` — current advanced seed (for writing back to `GameState.rngSeed`)
- Pure: no side effects, same seed always produces same sequence.

<!-- TODO: Choose PRNG algorithm. Architecture doc says "seeded deterministic RNG" but doesn't specify. Options: (1) `xoshiro256**` — fast, good statistical properties, 256-bit state. (2) Mulberry32 — simpler, 32-bit, adequate for card games. (3) PCG — excellent distribution, 64-bit. Recommend `xoshiro256**` for future-proofing. Need to verify a TypeScript implementation exists or write one. -->

Depends: none
Test:
1. Same seed → same sequence of 1000 `next()` calls.
2. `shuffle` of [1..52] with same seed → identical result twice.
3. Different seed → different sequence.
4. `getSeed()` after operations → can resume from that seed and get same continuation.
Acceptance: Determinism tests pass. No external dependencies (pure implementation).

### P0.7 — GameMode interface and shared-deck implementation

**Files**: `mode/gameMode.ts`, `mode/sharedDeck.ts`

Define per §14:
- `GameMode` interface with `id`, `resolveLibrary`, `resolveGraveyard`, `simultaneousDrawOrder`, `determineOwner`
- `SharedDeckMode` implementation:
  - `resolveLibrary` → always returns shared library zone
  - `resolveGraveyard` → always returns shared graveyard zone
  - `simultaneousDrawOrder` → alternating starting with active player
  - `determineOwner` → player who drew/played the card

<!-- TODO: For `determineOwner` on draw: the variant rules say each player draws from the shared deck — does the drawn card's `owner` become the drawing player? Architecture doc §14 says yes (`'draw' | 'play'`). Confirm this matches the canonical Forgetful Fish variant rules in PROJECT_OVERVIEW.md. -->

Depends: P0.1, P0.3 (needs GameState, PlayerId, ZoneRef)
Test:
1. `resolveLibrary` returns `{ zone: 'library' }` regardless of player.
2. `simultaneousDrawOrder(count=4, activePlayer='p1')` → `['p1','p2','p1','p2']`.
3. `determineOwner` for draw action returns the drawing player's ID.
Acceptance: Tests pass, mode can be injected into GameState.

### P0.8 — GameAction base types

**Files**: `actions/action.ts`

Define per §7:
- `ActionId` (string type alias)
- `ActionType` enum/union: `DRAW`, `MOVE_ZONE`, `DEAL_DAMAGE`, `COUNTER`, `SET_CONTROL`, `DESTROY`, `TAP`, `UNTAP`, `ADD_MANA`, `LOSE_LIFE`, `GAIN_LIFE`, `CREATE_TOKEN`, `SHUFFLE`
- `GameAction` base interface: `{ id: ActionId; type: ActionType; source: ObjectRef | null; controller: PlayerId; appliedReplacements: ReplacementId[] }`
- Per-type action interfaces (e.g., `DrawAction extends GameAction`, `MoveZoneAction extends GameAction { objectId: ObjectId; from: ZoneRef; to: ZoneRef; toIndex?: number }`)

<!-- TODO: Enumerate all action subtypes needed for the full 80-card deck. The architecture doc lists DRAW, MOVE_ZONE, DEAL_DAMAGE, COUNTER, SET_CONTROL as examples. Full list needs to cover: mana addition, life changes, token creation, shuffling, tapping/untapping, sacrificing (probably MOVE_ZONE to graveyard with sacrifice flag). -->

Depends: P0.1
Test: Type-level tests — construct one action of each type, verify discriminated union works.
Acceptance: All action types compile and are exported.

### P0.9 — Command types

**Files**: `commands/command.ts`

Define per §3:
- `Command` discriminated union with all variants:
  - `CAST_SPELL { cardId, targets?, modePick? }`
  - `ACTIVATE_ABILITY { sourceId, abilityIndex, targets? }`
  - `PASS_PRIORITY`
  - `MAKE_CHOICE { payload: ChoicePayload }`
  - `DECLARE_ATTACKERS { attackers: ObjectId[] }`
  - `DECLARE_BLOCKERS { assignments: BlockerAssignment[] }`
  - `PLAY_LAND { cardId: ObjectId }`
  - `CONCEDE`
- `Target`, `Mode`, `ChoicePayload`, `BlockerAssignment` supporting types

<!-- TODO: Define `ChoicePayload` subtypes — needs to carry data for each PendingChoice type (CHOOSE_CARDS → selected ObjectIds, ORDER_CARDS → ordered ObjectIds, NAME_CARD → card name string, CHOOSE_REPLACEMENT → replacement ID, etc.). -->

Depends: P0.1
Test: Type-level tests — construct each command variant.
Acceptance: Types compile, exported.

### P0.10 — processCommand shell

**Files**: `engine/processCommand.ts`

Implement the entry point per §Entry point contract:
```
processCommand(state: Readonly<GameState>, command: Command, rng: Rng): CommandResult
```
- `CommandResult = { nextState: GameState; newEvents: GameEvent[]; pendingChoice?: PendingChoice }`
- Initial implementation: switch on `command.type`, delegate to stub handlers that return state unchanged.
- Wire up RNG: use the provided `rng` instance for all randomness, then write its advanced seed (via `rng.getSeed()`) back to `nextState.rngSeed`. Callers are responsible for constructing `rng` from `state.rngSeed` before invoking `processCommand`.

Depends: P0.3, P0.5, P0.6, P0.9
Test: Call `processCommand` with `PASS_PRIORITY` on a minimal state → returns same state, no events, no pending choice. Verify `rngSeed` is unchanged when no RNG consumed.
Acceptance: Entry point callable, returns valid `CommandResult`.

### P0.11 — Island card definition (reference implementation)

**Files**: `cards/cardDefinition.ts`, `cards/island.ts`, `cards/index.ts`

Define per §5:
- `CardDefinition` type with all fields from §5 (id, name, manaCost, typeLine, subtypes, color, supertypes, power, toughness, keywords, staticAbilities, triggeredAbilities, activatedAbilities, onResolve, continuousEffects, replacementEffects)
- `ManaCost` type (for Island: empty/zero)
- Island definition: basic land, type `['Land']`, subtype `[{ kind: 'basic_land_type', value: 'Island' }]`, activated ability for `{T}: Add {U}`
- Card registry in `cards/index.ts`: `Map<string, CardDefinition>`, initially containing only Island

<!-- TODO: Define `ActivatedAbilityAst` type for mana abilities. Island's "{T}: Add {U}" needs: cost (tap), effect (add mana). Mana abilities don't use the stack — this distinction matters for the kernel in Phase 1. The ability AST types (§8) need at minimum: KeywordAbilityAst, StaticAbilityAst, ActivatedAbilityAst, TriggerDefinitionAst. Define stubs for all four here; flesh out as cards need them. -->

Depends: P0.1, P0.8 (needs action types for the mana ability effect)
Test:
1. Load Island from registry by ID "island".
2. Verify typeLine, subtypes, mana ability structure.
3. Verify it satisfies `CardDefinition` type.
Acceptance: Card registry works, Island loads cleanly.

### P0.12 — AbilityAst base types

**Files**: `cards/abilityAst.ts`

Define the structured AST types per §8:
- `BasicLandType` union: `'Plains' | 'Island' | 'Swamp' | 'Mountain' | 'Forest'`
- `Color` union: `'white' | 'blue' | 'black' | 'red' | 'green'`
- `SubtypeAtom` discriminated union: `basic_land_type | creature_type | other`
- `ColorAtom`: `{ kind: 'color'; value: Color }`
- `KeywordAbilityAst`: `landwalk | flying | first_strike` (extend as needed)
- `StaticAbilityAst`: `cant_attack_unless | when_no_islands_sacrifice`
- `AttackConditionAst`: `defender_controls_land_type`
- `TextChangeEffect`: `{ kind: 'text_change'; fromLandType?; toLandType?; fromColor?; toColor?; target: ObjectRef; duration: Duration }`
- `Duration` union: `permanent | until_end_of_turn | while_source_on_battlefield | until_cleanup | as_long_as`
- Stubs for: `ActivatedAbilityAst`, `TriggerDefinitionAst`, `ResolutionStep`, `ConditionAst`

Depends: P0.1
Test: Type-level — construct a Dandan-like ability AST, verify types narrow correctly.
Acceptance: All AST types compile, used by `CardDefinition` in P0.11.

### P0.13 — Update index.ts exports and remove old state.ts

**Files**: `index.ts`, delete old `state.ts`

- Barrel-export all new modules from `index.ts`
- Remove the old `state.ts` (its types are superseded by `state/gameState.ts`)
- Update or remove `test/state.test.ts` if it was migrated in P0.3

Depends: all P0 tasks above
Test: `pnpm typecheck` passes for the game-engine package. `pnpm test` passes.
Acceptance: Clean build, no dead imports, all new types accessible from package root.

---

## Phase 1 — Turn loop + priority + basic commands

### P1.1 — PriorityState type and priority engine

**Files**: `state/priorityState.ts`, `engine/kernel.ts` (start)

Define:
- `PriorityState { activePlayerPassed: boolean; nonActivePlayerPassed: boolean; playerWithPriority: PlayerId }`
- `givePriority(state: GameState, to: PlayerId): GameState`
- `handlePassPriority(state: GameState, player: PlayerId): GameState | 'both_passed'`
  - If only one player passed → update state, give priority to other player
  - If both passed → return `'both_passed'` signal for stack/phase advancement

Depends: P0.3
Test:
1. Active player passes → non-active gets priority.
2. Both pass on empty stack → `'both_passed'`.
3. Non-active passes after active → `'both_passed'`.
Acceptance: Priority transitions are correct per §4 rules.

### P1.2 — Phase/step sequencing

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

<!-- TODO: First-turn draw skip — the variant rules in PROJECT_OVERVIEW.md should specify whether the starting player skips their first draw. Standard MTG: starting player skips. Verify this applies to Forgetful Fish. -->

Depends: P0.3, P1.1
Test:
1. Walk through a full turn cycle with both players always passing → every phase/step visited in order.
2. Untap step untaps a tapped permanent.
3. Draw step adds a card to active player's hand.
4. Turn advance swaps active player.
Acceptance: Full turn cycle works with trivial (pass-only) game flow.

### P1.3 — Draw command implementation

**Files**: `engine/processCommand.ts` (extend), `engine/kernel.ts` (extend)

Implement drawing:
- `drawCard(state: GameState, playerId: PlayerId, rng: Rng): { state: GameState; events: GameEvent[] }`
- Remove top card from library, add to player's hand
- Update object's zone and owner (via `GameMode.determineOwner`)
- Bump `zcc`, store LKI snapshot
- Emit `CARD_DRAWN` event
- Handle empty library → player loses (SBA will catch this, but draw itself should still work)

Depends: P0.3, P0.4, P0.5, P0.7, P0.10
Test:
1. Draw from library with 5 cards → hand gains 1, library loses 1, correct card.
2. Draw emits `CARD_DRAWN` event with correct playerId and cardId.
3. Object's zone updated to hand, zcc bumped.
4. LKI snapshot stored for the pre-draw state.
Acceptance: Draw is invoked via the turn structure (draw step through `advanceStep` calling `drawCard`) and produces the behavior described in tests 1–4 when run in an end-to-end game flow.

### P1.4 — Play land command

**Files**: `engine/processCommand.ts` (extend), `commands/validate.ts`

Implement `PLAY_LAND` command:
- Validation in `validate.ts`:
  - Card is in player's hand
  - Player hasn't played a land this turn (`turnState.landPlayedThisTurn`)
  - It's a main phase, stack is empty, player has priority
- Execution: move card from hand to battlefield, set `landPlayedThisTurn = true`
- Emit `ZONE_CHANGE` event
- Bump zcc, update zones

Depends: P0.3, P0.9, P0.10, P1.1
Test:
1. Play Island from hand → battlefield has Island, hand shrinks, `landPlayedThisTurn` true.
2. Second land play → rejected (validation fails).
3. Play land during combat → rejected.
4. Play land when not your priority → rejected.
Acceptance: Land plays work, validation catches all illegal attempts.

### P1.5 — Mana payment (basic lands + special lands)

**Files**: `engine/kernel.ts` (extend), `actions/action.ts` (extend if needed)

Implement mana system:
- `ManaPool` type: `{ W: number; U: number; B: number; R: number; G: number; C: number }`
- `tapForMana(state: GameState, objectId: ObjectId): { state: GameState; events: GameEvent[] }`
  - Tap the permanent, add mana to controller's pool
  - Mana abilities don't use the stack (per MTG rules)
- `payManaCost(state: GameState, playerId: PlayerId, cost: ManaCost): GameState | 'insufficient'`
  - Deduct from pool, return new state or fail

<!-- TODO: Special lands mana abilities — Izzet Boilerworks taps for {U}{R}, Svyelunite Temple taps for {U}, sacrifice for {U}{U}. These are activated abilities but mana abilities don't use the stack. Define how these interact with the activation system. Also: Lonely Sandbar/Remote Isle have cycling (activated, not mana). Define the distinction clearly in the ActivatedAbilityAst. -->

Depends: P0.3, P0.8, P0.11
Test:
1. Tap Island → pool gains 1 blue, Island is tapped.
2. Pay {U} with 1 blue in pool → pool empty, success.
3. Pay {U} with empty pool → 'insufficient'.
4. Tap already-tapped land → rejected.
Acceptance: Mana generation and payment work for Island.

### P1.6 — Cast spell basics (put on stack + basic resolve)

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
  3. Move card to appropriate zone (battlefield for permanents, graveyard for instants/sorceries)
  4. Emit `SPELL_RESOLVED` event

Depends: P0.3, P0.5, P0.8, P0.9, P0.10, P1.1, P1.5
Test:
1. Cast a hypothetical 1-mana instant → moves to stack, mana deducted.
2. Both pass → spell resolves, moves to graveyard.
3. Cast creature → resolves to battlefield.
4. Cast with insufficient mana → rejected.
Acceptance: Spell lifecycle (hand → stack → resolve → destination) works end-to-end.

### P1.7 — Legal command generation

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

Depends: P0.3, P0.9, P1.1, P1.4, P1.5, P1.6
Test:
1. Empty battlefield, Island in hand, main phase → legal commands include PLAY_LAND and PASS_PRIORITY.
2. No cards, tapped lands → only PASS_PRIORITY and CONCEDE.
3. Pending choice → only MAKE_CHOICE.
Acceptance: Legal commands accurately reflect game state.

### P1.8 — Minimal SBA loop

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

Depends: P0.2, P0.3, P0.5
Test:
1. Creature with 0 toughness → destroyed by SBA.
2. Player at 0 life → loses.
3. SBA loop terminates when no more SBAs apply.
4. Two SBAs simultaneously (creature dies + player at 0) → both apply.
Acceptance: SBA loop is deterministic and reaches a fixed point.

### P1.9 — EventBus (trigger scanning infrastructure)

**Files**: `events/eventBus.ts`

Implement event emission and trigger scanning infrastructure:
- `emitEvents(state: GameState, events: GameEvent[]): GameState`
  - Scan all permanents with `triggeredAbilities` for matching event types
  - Collect matching triggers into `state.triggerQueue`
  - (Actual trigger ordering/stacking deferred to Phase 4)
- Initially: just the scan infrastructure, no triggers to find yet

Depends: P0.2, P0.3, P0.5
Test:
1. Emit `ZONE_CHANGE` event with no permanents with triggers → triggerQueue unchanged.
2. Infrastructure can iterate objectPool and check triggeredAbilities (even if none exist yet).
Acceptance: Event emission pipeline exists, ready for triggers.

### P1.10 — Integration test: full turn with Island

Wire everything together:
- Set up game: 2 players, shared library of 20 Islands
- Player 1's turn: untap → upkeep → draw → main phase → play Island → tap Island for mana (pool has {U}) → pass → opponent passes → next phase → ... → end turn
- Player 2's turn: draw → play Island → pass through
- Verify: correct events emitted at each step, state consistent throughout

Depends: all P1 tasks
Test: Full scenario test in `test/integration/turn-cycle.test.ts`.
Acceptance: A full two-turn game cycle with only Islands works correctly end-to-end.

---

## Phase 2 — Stack resolution + whiteboard + choices + action pipeline

### P2.1 — EffectContext, Whiteboard, and ResolutionCursor

**Files**: `stack/stackItem.ts` (extend), `actions/whiteboard.ts`

Flesh out per §6:
- `ResolutionCursor`: `{ kind: 'start' } | { kind: 'step'; index: number } | { kind: 'waiting_choice'; choiceId: string } | { kind: 'done' }`
- `EffectContext { stackItemId; source; controller; targets; cursor; whiteboard }`
- `Whiteboard { actions: GameAction[]; scratch: Record<string, unknown> }`
- Helpers: `advanceCursor(ctx: EffectContext): EffectContext`, `writeToScratch(ctx, key, value)`, `readFromScratch(ctx, key)`

Depends: P0.1, P0.8, P1.6
Test:
1. Create EffectContext with cursor at 'start', advance to step 0, then step 1.
2. Write/read scratch data round-trips correctly.
3. Cursor at 'waiting_choice' preserves whiteboard state.
Acceptance: Context persists across simulated choice interruptions.

### P2.2 — PendingChoice system

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

Depends: P0.1, P0.9
Test: Construct each PendingChoice type, verify constraints are well-formed.
Acceptance: Types compile, all 8 choice types have defined constraints.

### P2.3 — MAKE_CHOICE command handling and choice resumption

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

Depends: P2.1, P2.2, P1.6
Test:
1. Spell resolves to step that needs a choice → returns pendingChoice, resolution paused.
2. MAKE_CHOICE with valid payload → resolution resumes from correct step (not re-running earlier steps).
3. MAKE_CHOICE with invalid payload → rejected.
4. MAKE_CHOICE when no pendingChoice → rejected.
Acceptance: Multi-step resolution with choices works without double-application.

### P2.4 — Action Modifier Pipeline

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

Depends: P0.8, P2.1
Test:
1. Actions with valid targets pass through unchanged.
2. Action targeting object that changed zones → filtered out.
3. Pipeline returns new array (doesn't mutate input).
Acceptance: Pipeline infrastructure works, ready for replacement effects.

### P2.5 — Replacement effect registry and apply-once tracking

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

Depends: P0.8, P2.2, P2.4
Test:
1. Single replacement rewrites action → action modified, replacement ID in `appliedReplacements`.
2. Same replacement doesn't re-apply to already-rewritten action.
3. Two replacements applicable → PendingChoice emitted for player to choose order.
4. Loop terminates (no infinite re-application).
Acceptance: Replacement pipeline is sound with apply-once semantics.

### P2.6 — Target validation with ObjectRef staleness

**Files**: `commands/validate.ts` (extend), `stack/resolve.ts` (extend)

Implement per §2:
- At spell/ability resolution time:
  - For each target `ObjectRef { id, zcc }`:
    - Look up object in `objectPool` by `id`
    - If object's current `zcc` !== target's `zcc` → target is stale (object changed zones)
    - Stale target = illegal target
  - If ALL targets are illegal → spell fizzles (doesn't resolve, goes to graveyard)
  - If SOME targets are illegal → resolve with remaining legal targets only

Depends: P0.1, P0.2, P1.6
Test:
1. Target still on battlefield with matching zcc → valid.
2. Target moved to graveyard (zcc bumped) → stale, illegal.
3. All targets illegal → spell fizzles, emits no resolution events, card to graveyard.
4. 2 targets, 1 illegal → spell resolves for remaining target only.
Acceptance: Fizzle rules match MTG CR 608.2b.

### P2.7 — Card: Memory Lapse

**Files**: `cards/memory-lapse.ts`

Cards: **Memory Lapse** (counter target spell, put on top of library)

Implement per card-mechanism mapping:
- CardDefinition: instant, {1}{U}, `onResolve`:
  1. `COUNTER` action targeting the spell on the stack
  2. `MOVE_ZONE` action: countered spell → top of library (not graveyard)
- Resolution steps:
  - Step 0: counter target spell (via whiteboard `COUNTER` action)
  - Step 1: move countered spell to top of library (via `MOVE_ZONE` with `toIndex: 0`)
- Shared-deck interaction: "owner's library" resolves via `GameMode.resolveLibrary` → shared library

Depends: P0.11 (CardDefinition type), P2.1, P2.4, P1.6
Test:
1. Cast Memory Lapse targeting opponent's spell → spell countered, moved to top of shared library.
2. Memory Lapse targeting own spell → same behavior.
3. Target spell leaves stack before resolution → Memory Lapse fizzles.
4. Verify countered spell is on TOP of shared library (index 0).
Acceptance: Memory Lapse works per Oracle text with shared-deck semantics.

### P2.8 — Card: Accumulated Knowledge

**Files**: `cards/accumulated-knowledge.ts`

Cards: **Accumulated Knowledge** (draw X where X = count in graveyards + 1)

Implement:
- CardDefinition: instant, {1}{U}, `onResolve`:
  - Step 0: count cards named "Accumulated Knowledge" in graveyard (shared graveyard — includes the AK about to resolve, which is still on stack, so count graveyard only)
  - Step 1: draw X+1 cards where X = that count
- Uses `GameMode.resolveGraveyard` → shared graveyard

<!-- TODO: Verify the count timing — when AK resolves, it's still on the stack, not in graveyard yet. So the count is of AKs already in graveyard. After resolution, AK itself goes to graveyard. This means first AK draws 1, second draws 2, etc. Confirm this matches Oracle text: "Draw a card, then draw a card for each card named Accumulated Knowledge in each graveyard." -->

Depends: P0.11, P2.1, P1.3
Test:
1. First AK (0 in graveyard) → draw 1 card.
2. Second AK (1 in graveyard) → draw 2 cards.
3. Third AK → draw 3.
4. Shared graveyard is used (not per-player).
Acceptance: Count is correct and uses shared graveyard.

### P2.9 — Card: Brainstorm

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

Depends: P0.11, P2.1, P2.2, P2.3, P1.3
Test:
1. Cast Brainstorm with 2-card hand → draw 3 (hand = 5) → choose 2 → put back in order.
2. Verify shared library top 2 are the chosen cards in chosen order.
3. Verify persisted context: if server restarts between choices, resolution resumes correctly.
4. Verify opponent doesn't see drawn cards via event redaction.
Acceptance: Multi-choice resolution works end-to-end, persisted context survives interruption.

### P2.10 — Card: Mystical Tutor

**Files**: `cards/mystical-tutor.ts`

Cards: **Mystical Tutor** (search library for instant/sorcery, put on top)

Implement:
- CardDefinition: instant, {U}, `onResolve`:
  - Step 0: Emit `PendingChoice { type: 'CHOOSE_CARDS'; candidates: instants/sorceries in library; min: 0; max: 1 }`
  - Step 1 (after choice): `SHUFFLE` library
  - Step 2: `MOVE_ZONE` chosen card to top of library

<!-- TODO: Mystical Tutor Oracle text: "Search your library for an instant or sorcery card and reveal that card. Shuffle your library, then put the card on top of it." Resolution order is: search → reveal → shuffle → put on top. Steps above reflect this. Verify shared-deck semantics for "your library" via GameMode. -->

Depends: P0.6 (RNG for shuffle), P0.11, P2.1, P2.2, P2.3
Test:
1. Cast Mystical Tutor → see instants/sorceries in library → choose one → library shuffled → chosen card on top.
2. Choose not to find → library still shuffled.
3. Shared library semantics via GameMode.
Acceptance: Full search-shuffle-put-on-top sequence works.

### P2.11 — Card: Predict

**Files**: `cards/predict.ts`

Cards: **Predict** (name a card, mill 2, if named card milled draw 2)

Implement per §6 multi-step:
- CardDefinition: instant, {1}{U}, `onResolve`:
  - Step 0: Emit `PendingChoice { type: 'NAME_CARD' }` — player names any Magic card
  - Step 1 (after name choice): Mill top 2 of shared library → shared graveyard
  - Step 2: Check if named card was among milled cards
  - Step 3: If yes, draw 2 cards

Depends: P0.11, P2.1, P2.2, P2.3, P1.3
Test:
1. Name a card that IS on top → mill 2 → draw 2 (net +2 cards).
2. Name a card that is NOT in top 2 → mill 2 → no draw.
3. Shared library/graveyard used.
4. Named card stored in scratch, persisted across cursor advancement.
Acceptance: Conditional draw works correctly based on named card match.

---

## Phase 3 — Continuous effects + layers

### P3.1 — ContinuousEffect type and registry

**Files**: `effects/continuous/layers.ts`

Define per §9:
- `ContinuousEffect { id; source: ObjectRef; layer: Layer; sublayer?: Sublayer; timestamp: number; duration: Duration; appliesTo: EffectTarget; apply: (view: GameObjectView) => GameObjectView; dependsOn?: (other, state) => boolean }`
- `Layer` enum: `COPY = 1, CONTROL = 2, TEXT = 3, TYPE = 4, COLOR = 5, ABILITY = 6, PT_SET = '7a', PT_ADJUST = '7b', PT_SWITCH = '7c'`
- `addContinuousEffect(state: GameState, effect: ContinuousEffect): GameState`
- `removeContinuousEffect(state: GameState, effectId: string): GameState`

Depends: P0.1, P0.3, P0.12
Test:
1. Add effect → present in `state.continuousEffects`.
2. Remove effect → absent.
3. Effect has all required fields.
Acceptance: CRUD for continuous effects works.

### P3.2 — computeGameObject (layer application engine)

**Files**: `effects/continuous/layers.ts` (extend)

Implement `computeGameObject(objectId, state): GameObjectView` per §9:
1. Start with base state from `objectPool`
2. Gather all `ContinuousEffect`s where `appliesTo` matches this object
3. Group by layer
4. Within each layer: sort by timestamp (default), or by dependency if `dependsOn` exists
5. Apply each effect's `apply` function in order
6. Return derived `GameObjectView`

Caching: skip for now (recompute each time) — per architecture doc, acceptable for ~15 permanents.

Depends: P3.1, P0.2
Test:
1. Object with no effects → view equals base.
2. Object with Layer 7a P/T set effect → view has modified P/T.
3. Object with effects in Layer 3 and Layer 6 → applied in layer order (3 before 6).
4. Two effects in same layer → applied in timestamp order.
Acceptance: Layer system produces correct derived views.

### P3.3 — Duration tracking and cleanup

**Files**: `effects/continuous/duration.ts`

Implement per §9:
- `cleanupExpiredEffects(state: GameState): GameState`
  - `until_end_of_turn` → removed during cleanup step
  - `while_source_on_battlefield` → removed when source leaves battlefield
  - `until_cleanup` → removed at specific turn's cleanup
  - `as_long_as` → removed when condition becomes false
  - `permanent` → never removed by duration (only by explicit removal)
- Hook into cleanup step (P1.2) and zone-change events

Depends: P3.1, P1.2
Test:
1. `until_end_of_turn` effect survives until cleanup → removed.
2. `while_source_on_battlefield` effect → source leaves → effect removed.
3. `permanent` effect → never auto-removed.
Acceptance: Effects expire at correct times.

### P3.4 — Layer 2: control-changing effects

**Files**: `effects/continuous/controlChange.ts`

Cards: **Ray of Command** (partial — control change aspect)

Implement:
- Control change continuous effect:
  - Layer 2 application: changes `controller` field on GameObjectView
  - Duration: `until_end_of_turn` for Ray of Command
- `SET_CONTROL` action type: creates a Layer 2 continuous effect
- When control changes: update which player gets priority for choices involving the object

Depends: P3.1, P3.2, P0.8
Test:
1. Apply Layer 2 control change → `computeGameObject` returns new controller.
2. Effect expires → controller reverts to owner.
Acceptance: Control changes work through the layer system.

### P3.5 — Layer 3: text-changing effects with dependency ordering

**Files**: `effects/continuous/textChange.ts`, `effects/continuous/dependency.ts`

Cards: **Mind Bend**, **Crystal Spray**

Implement per §8:
- `TextChangeEffect` application:
  - Walk the ability AST of the affected object
  - Substitute `BasicLandType` tokens (fromLandType → toLandType)
  - Substitute `Color` tokens (fromColor → toColor)
- Dependency ordering for Layer 3:
  - Build dependency graph: effect A depends on B if B's output changes A's applicability
  - Topological sort; break cycles with timestamp per CR 613.8
  - Apply in resolved order

Depends: P3.1, P3.2, P0.12
Test:
1. Mind Bend changes "Island" to "Swamp" on Dandan → all `BasicLandType` tokens substituted.
2. Crystal Spray changes "Island" to "Mountain" on one ability → only that instance changed.
3. Mind Bend + Crystal Spray on same permanent → dependency ordering determines which applies first.
4. Dependency resolution handles the case where one text change affects another's targets.
Acceptance: Layer 3 with dependency ordering works for Mind Bend + Crystal Spray interaction.

### P3.6 — Layer 4: type-changing effects

**Files**: `effects/continuous/typeChange.ts`

Cards: **Dance of the Skywise**

Implement:
- Type change continuous effect:
  - Layer 4 application: changes `typeLine`, `subtypes` on GameObjectView
  - Dance of the Skywise: target creature becomes Dragon base type with new types
- Interacts with Layer 7a (P/T set) for Dance of the Skywise's "4/4" component

Depends: P3.1, P3.2
Test:
1. Dance of the Skywise on Dandan → creature is now a 4/4 Dragon (type changed, P/T set).
2. Effect expires at end of turn → creature reverts to Dandan.
Acceptance: Type changing works, combined with P/T setting for Dance.

### P3.7 — Layer 6: ability adding/removing

**Files**: `effects/continuous/abilityChange.ts`

Cards: **Dandan** (has keywords — islandwalk, via Layer 6 application from static definition)

Implement:
- Ability modification in Layer 6:
  - Add keyword abilities (e.g., islandwalk)
  - Remove abilities
  - Modify existing abilities
- For Dandan: islandwalk is on the card definition, applied through Layer 6 computation

Depends: P3.1, P3.2, P0.12
Test:
1. Dandan has islandwalk in computed view.
2. An effect removing abilities → islandwalk absent from computed view.
Acceptance: Keyword abilities appear/disappear correctly in derived views.

### P3.8 — Layer 7: P/T modifications

**Files**: `effects/continuous/ptChange.ts`

Implement all sublayers:
- Layer 7a: characteristic-defining abilities and P/T setting effects (Dance of the Skywise sets to 4/4)
- Layer 7b: P/T adjustments from counters and +N/+N effects
- Layer 7c: P/T switching

Depends: P3.1, P3.2
Test:
1. Dance of the Skywise (7a) sets Dandan (4/1) to 4/4.
2. Hypothetical +1/+1 counter (7b) on a 4/4 → 5/5.
3. P/T switching (7c) on a 4/1 → 1/4.
4. All sublayers applied in order.
Acceptance: P/T math is correct through all sublayers.

### P3.9 — Card: Dandan (full implementation)

**Files**: `cards/dandan.ts`

Cards: **Dandan** (islandwalk, can't attack unless defender controls Island, sacrifice when no Islands)

Implement:
- CardDefinition: creature, {U}{U}, 4/1
- Keywords: `[{ kind: 'landwalk', landType: 'Island' }]` (islandwalk)
- Static abilities:
  - `{ kind: 'cant_attack_unless', condition: { kind: 'defender_controls_land_type', landType: 'Island' } }`
  - `{ kind: 'when_no_islands_sacrifice', landType: 'Island' }` — state-triggered ability
- All `BasicLandType` tokens are structured for Layer 3 rewriting (Mind Bend can change them)

Note: The sacrifice trigger is a state-triggered ability (Phase 4, P4.6). The "must attack" enforcement is Phase 4 (P4.3). This task defines the card; combat/trigger behavior tested in Phase 4.

Depends: P0.11, P0.12, P3.5 (so Mind Bend can rewrite tokens), P3.7
Test:
1. Dandan definition loads from registry.
2. `computeGameObject` shows Dandan with islandwalk, 4/1, correct abilities.
3. Mind Bend changing "Island" to "Swamp" on Dandan → all three ability tokens update (verified via computeGameObject).
Acceptance: Dandan's full ability structure is Layer-3-rewritable.

### P3.10 — Card: Ray of Command

**Files**: `cards/ray-of-command.ts`

Cards: **Ray of Command** (gain control of creature until EOT, untap it, it must attack)

Implement:
- CardDefinition: instant, {3}{U}, `onResolve`:
  - Step 0: `SET_CONTROL` action (target creature → controller becomes caster)
  - Step 1: `UNTAP` action on the creature
  - Step 2: Add continuous effect: "must attack this turn" (duration: until_end_of_turn)
- Creates Layer 2 continuous effect for control change

Depends: P0.11, P2.1, P3.4
Test:
1. Cast Ray of Command on opponent's Dandan → control changes, creature untaps.
2. "Must attack" enforced (tested in Phase 4).
3. End of turn → control reverts.
Acceptance: Control change + untap resolve correctly, duration tracked.

### P3.11 — Card: Mind Bend

**Files**: `cards/mind-bend.ts`

Cards: **Mind Bend** (change one basic land type word or color word permanently)

Implement:
- CardDefinition: instant, {U}, `onResolve`:
  - Step 0: Emit choices for which word to change and what to change it to
  - Step 1: Create `TextChangeEffect` continuous effect with `duration: 'permanent'` in Layer 3

<!-- Note: Mind Bend's Oracle text says "replacing all instances of one basic land type with another (This effect lasts indefinitely)." The TextChangeEffect AST walker must replace ALL matching tokens on the permanent, not just one occurrence. This is confirmed and not an open question. -->

Depends: P0.11, P2.1, P2.2, P3.5
Test:
1. Mind Bend on Dandan changing Island → Swamp → all three ability tokens changed.
2. Effect is permanent (survives end of turn, cleanup).
3. Mind Bend on a land → its subtype changes.
Acceptance: Permanent text change works on all instances.

### P3.12 — Card: Crystal Spray

**Files**: `cards/crystal-spray.ts`

Cards: **Crystal Spray** (change one instance of a basic land type or color word until EOT, draw a card)

Implement:
- CardDefinition: instant, {2}{U}, `onResolve`:
  - Step 0: Choose which instance and what to change
  - Step 1: Create `TextChangeEffect` with `duration: 'until_end_of_turn'`
  - Step 2: `DRAW` action (cantrip)

<!-- TODO: Crystal Spray targets "one" instance, not all. Need to define how the player selects which specific instance on the permanent to change. This requires enumerating the BasicLandType/Color tokens on the target's abilities and letting the player pick one. Define the UI/choice mechanism for this. -->

Depends: P0.11, P2.1, P2.2, P3.5
Test:
1. Crystal Spray changing one "Island" on Dandan → only that instance changed, others remain "Island".
2. Draw a card after resolution.
3. Effect expires at end of turn.
4. Crystal Spray + Mind Bend dependency ordering (tested more thoroughly in Phase 7).
Acceptance: Single-instance text change works, cantrip draws.

### P3.13 — Card: Dance of the Skywise

**Files**: `cards/dance-of-the-skywise.ts`

Cards: **Dance of the Skywise** (target creature becomes 4/4 Dragon with flying until EOT)

Implement:
- CardDefinition: instant, {1}{U}, `onResolve`:
  - Step 0: Create continuous effects on target creature:
    - Layer 4: type change to Dragon
    - Layer 6: gains flying
    - Layer 7a: base P/T set to 4/4
  - All with `duration: 'until_end_of_turn'`

Depends: P0.11, P2.1, P3.6, P3.7, P3.8
Test:
1. Dance on Dandan → creature is 4/4 Dragon with flying (not islandwalk? — need to check if it loses other abilities).
2. End of turn → reverts to 4/1 Dandan with islandwalk.
Acceptance: Multi-layer effects (4 + 6 + 7a) all apply and expire together.

<!-- TODO: Dance of the Skywise Oracle text: "Until end of turn, target creature you control becomes a 4/4 blue Dragon with flying." This is a "becomes" effect — does it remove existing abilities? Per MTG rules, "becomes [type] with [ability]" means it loses other abilities. Verify whether Dandan loses islandwalk, the attack restriction, and the sacrifice ability while under this effect. If so, the Layer 4/6 effects need to replace, not just add. -->

### P3.14 — Integration test: layer interactions

Wire together:
- Mind Bend on Dandan (Layer 3 rewriting all tokens)
- Crystal Spray on same Dandan (Layer 3 single-instance, dependency ordering)
- Dance of the Skywise on Dandan (Layers 4 + 6 + 7a)
- Verify `computeGameObject` produces correct result in each scenario

Depends: P3.9, P3.10, P3.11, P3.12, P3.13
Test: Multi-scenario test in `test/integration/layer-interactions.test.ts`.
Acceptance: All layer interactions produce correct derived views.

---

## Phase 4 — Combat + triggers + trigger ordering

### P4.1 — Declare attackers

**Files**: `engine/combat.ts`

Implement per §4:
- `DECLARE_ATTACKERS` command handling:
  - Validate: only creatures controlled by active player, not tapped, not summoning sick (unless haste)
  - "Must attack" enforcement (for Dandan, Ray of Command's temporary effect)
  - Move to attackers declared → give priority
- Emit events for attacker declaration

<!-- TODO: In two-player, there's only one possible defender. But Dandan has "can't attack unless defending player controls an Island" — this is checked at declaration time, not at resolution. Verify the attack legality check reads the computed (Layer 3-rewritten) condition, not the base card. -->

Depends: P1.2, P3.2, P3.9
Test:
1. Declare Dandan as attacker (opponent controls Island) → legal.
2. Declare Dandan as attacker (opponent controls no Island) → illegal.
3. Tapped creature → can't attack.
4. Summoning sick creature → can't attack.
Acceptance: Attacker legality is correct including Dandan restrictions.

### P4.2 — Declare blockers

**Files**: `engine/combat.ts` (extend)

Implement:
- `DECLARE_BLOCKERS` command handling:
  - Validate: defender's untapped creatures can block, evasion checks (islandwalk, flying)
  - Islandwalk: can't be blocked if defending player controls an Island (again, Layer 3-rewritable)
  - Flying: can only be blocked by creatures with flying or reach
- Block assignment (which blocker blocks which attacker)

Depends: P4.1, P3.2, P3.7
Test:
1. Dandan with islandwalk attacking (defender controls Island) → can't be blocked by non-islandwalking creatures.
2. Dandan with Mind-Bent swampwalk → can be blocked if defender has no Swamps.
3. Creature with flying → only blocked by flyer/reach.
Acceptance: Evasion checks use computed (layer-derived) abilities.

### P4.3 — Combat damage assignment and resolution

**Files**: `engine/combat.ts` (extend)

Implement:
- Damage assignment for each attacker-blocker pair
- Unblocked attacker deals damage to defending player
- Blocked attacker deals damage to blocker(s), blocker deals damage to attacker
- Emit `DAMAGE_DEALT` and `LIFE_CHANGED` events
- After damage: SBA check (creatures with lethal damage die, players at 0 lose)

Depends: P4.1, P4.2, P1.8
Test:
1. Unblocked Dandan (4/1) deals 4 damage to player.
2. Dandan blocked by Dandan → both deal damage, both die (4 damage to 1-toughness).
3. Player at 4 life, takes 4 → goes to 0, loses via SBA.
Acceptance: Combat damage math is correct, SBAs fire after damage.

### P4.4 — "Must attack if able" enforcement

**Files**: `engine/combat.ts` (extend)

Cards: **Dandan**, **Ray of Command** (temporary "must attack")

Implement per §4:
- During declare attackers step:
  - Identify all creatures with "must attack" requirement (from ability AST or continuous effect)
  - If player omits a "must attack" creature → invalid declaration
  - If "must attack" creature can't legally attack (e.g., Dandan restriction) → not forced

Depends: P4.1, P3.2, P3.9, P3.10
Test:
1. Dandan must attack → declaring without Dandan is illegal.
2. Dandan can't attack (opponent has no Islands) → "must attack" doesn't force impossible attack.
3. Ray of Command creature has "must attack this turn" → must be declared.
Acceptance: "Must attack" enforcement accounts for impossibility exceptions.

### P4.5 — Trigger batching with APNAP ordering

**Files**: `triggers/trigger.ts`, `triggers/batch.ts`

Implement per §10:
- After events are emitted, scan for matching triggers:
  - Iterate all permanents with `triggeredAbilities`
  - Check event type match and condition AST
  - Collect into `triggerQueue`
- APNAP ordering:
  - Active player's triggers first, then non-active
  - Within each player's triggers: if >1, emit `PendingChoice { type: 'ORDER_TRIGGERS' }`
  - Put ordered triggers on stack
- Loop: after triggers go on stack → SBA check → more triggers possible → repeat

Depends: P0.12, P2.2, P1.9
Test:
1. Single trigger fires → goes on stack immediately.
2. Two triggers for same player → player chooses order via `ORDER_TRIGGERS` choice.
3. Triggers for both players → APNAP: active player's go on stack first (resolve last).
4. Trigger → SBA → new trigger → repeat until stable.
Acceptance: APNAP ordering with player choice for simultaneous triggers.

### P4.6 — State-triggered abilities

**Files**: `triggers/trigger.ts` (extend), `engine/sba.ts` (extend)

Cards: **Dandan** ("when you control no Islands, sacrifice Dandan")

Implement:
- State-triggered abilities: triggered by a game state condition becoming true (not by an event)
- Check during SBA loop: for each permanent with state-triggered abilities, evaluate condition
- If condition true and trigger hasn't already been put on stack this SBA cycle → add to triggerQueue
- Dandan: condition = "controller controls no permanents with SubtypeAtom { kind: 'basic_land_type', value: <Layer-3-rewritten value> }"

Depends: P4.5, P3.2, P3.9
Test:
1. Controller has Islands → no trigger.
2. Last Island leaves battlefield → Dandan's sacrifice trigger fires.
3. Mind Bend changed "Island" to "Swamp" → trigger checks for Swamps instead.
4. Trigger fires at most once per SBA cycle (not infinite loop).
Acceptance: State-triggered ability with Layer 3-rewritable token works.

### P4.7 — Card: Mystic Sanctuary (ETB trigger)

**Files**: `cards/mystic-sanctuary.ts`

Cards: **Mystic Sanctuary** (ETB: if you control 3+ Islands, return instant/sorcery from graveyard to top of library)

Implement:
- CardDefinition: land (Island subtype — enters untapped? check Oracle)
- ETB trigger:
  - Condition: controller controls 3 or more Islands (including Mystic Sanctuary itself)
  - Effect: `CHOOSE_CARDS` from instants/sorceries in graveyard + `MOVE_ZONE` to top of library

<!-- TODO: Mystic Sanctuary Oracle: "If you control three or more other Islands" — the word "other" means Mystic Sanctuary itself doesn't count. Verify the condition checks for 3+ OTHER Islands, not including itself. Also: in shared-deck, "your graveyard" → shared graveyard via GameMode. -->

Depends: P0.11, P4.5, P2.2
Test:
1. Play Mystic Sanctuary with 3+ other Islands → trigger, choose instant/sorcery from graveyard → put on top of library.
2. Play Mystic Sanctuary with 2 other Islands → no trigger.
3. Shared graveyard used for search.
Acceptance: ETB trigger fires conditionally, graveyard search works.

### P4.8 — Card: Halimar Depths (ETB trigger)

**Files**: `cards/halimar-depths.ts`

Cards: **Halimar Depths** (ETB: look at top 3, put back in any order)

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - Look at top 3 of shared library
  - `PendingChoice { type: 'ORDER_CARDS'; cards: top3 }` — player arranges them
  - Put back in chosen order

Depends: P0.11, P4.5, P2.2
Test:
1. Play Halimar Depths → enters tapped, trigger fires, see top 3, reorder.
2. Library has <3 cards → see all remaining.
3. Opponent does NOT see the cards (view projection — tested in Phase 6).
Acceptance: ETB trigger with ordering choice works.

### P4.9 — Card: Temple of Epiphany (ETB trigger)

**Files**: `cards/temple-of-epiphany.ts`

Cards: **Temple of Epiphany** (ETB: scry 1)

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - Scry 1: look at top card of shared library
  - `PendingChoice { type: 'CHOOSE_CARDS'; candidates: [topCard]; min: 0; max: 1 }` — keep on top or put on bottom

<!-- TODO: Scry choice UX — scry is "look at top N, put any number on bottom in any order, rest on top in any order." For scry 1 it's binary: top or bottom. Define the choice type. Could use CHOOSE_YES_NO ("keep on top?") or CHOOSE_CARDS with special semantics. -->

Depends: P0.11, P4.5, P2.2
Test:
1. Play Temple → enters tapped, scry 1 trigger, choose to keep or bottom.
2. Keep → card stays on top.
3. Bottom → card goes to bottom of shared library.
Acceptance: Scry works with shared library.

### P4.10 — Card: Izzet Boilerworks (ETB trigger)

**Files**: `cards/izzet-boilerworks.ts`

Cards: **Izzet Boilerworks** (ETB: return a land you control to hand; tap for {U}{R})

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - `CHOOSE_CARDS { candidates: lands you control; min: 1; max: 1 }` — choose a land
  - `MOVE_ZONE` chosen land from battlefield to hand (bounce)
- Mana ability: `{T}: Add {U}{R}`

Depends: P0.11, P4.5, P2.2, P1.5
Test:
1. Play Izzet Boilerworks → enters tapped, must bounce a land.
2. Only land is Izzet Boilerworks itself → bounce itself.
3. Tap for mana → adds {U} and {R} to pool.
Acceptance: ETB bounce + dual mana ability works.

### P4.11 — Integration test: combat with triggers

Wire together:
- Dandan attacks Dandan scenario (both must attack, combat damage kills both, sacrifice triggers)
- Mystic Sanctuary + Halimar Depths entering simultaneously (APNAP trigger ordering)
- Ray of Command stealing Dandan mid-combat

Depends: all P4 tasks
Test: Scenario tests in `test/integration/combat-triggers.test.ts`.
Acceptance: Complex combat + trigger interactions work correctly.

---

## Phase 5 — Full deck completion + complex cards

### P5.1 — Card: Diminishing Returns

**Files**: `cards/diminishing-returns.ts`

Cards: **Diminishing Returns** (exile hand and graveyard, shuffle library, draw 7, lose 1 life)

Implement:
- CardDefinition: sorcery, {2}{U}{U}, `onResolve`:
  - Each player exiles their hand (to exile zone)
  - Exile shared graveyard (`GameMode.resolveGraveyard`)
  - Shuffle shared library
  - Each player draws 7 (alternating per `GameMode.simultaneousDrawOrder`)
  - Each player loses 1 life

<!-- TODO: Diminishing Returns Oracle: "Each player exiles all cards from their hand and graveyard, then shuffles their library, then draws seven cards." In shared-deck: (1) both players exile hands, (2) shared graveyard is exiled, (3) shared library is shuffled, (4) each player draws 7 alternating. Also: "You lose 1 life" — only the caster, not both players. Verify this interpretation. The "each player shuffles their library" in shared-deck means one shuffle of the shared library. -->

Depends: P0.6, P0.7, P0.11, P2.1, P1.3
Test:
1. Cast Diminishing Returns → both hands exiled, graveyard exiled, library shuffled, each draws 7.
2. Caster loses 1 life (not both players).
3. Shared library/graveyard semantics used throughout.
4. Drawing 7 alternates between players per variant rules.
Acceptance: Complex multi-zone card works with shared-deck hooks.

### P5.2 — Card: Supplant Form

**Files**: `cards/supplant-form.ts`

Cards: **Supplant Form** (return creature to hand, create token copy)

Implement:
- CardDefinition: instant, {4}{U}{U}, `onResolve`:
  - Step 0: `MOVE_ZONE` target creature from battlefield to owner's hand (bounce)
  - Step 1: `CREATE_TOKEN` — create a token that's a copy of the bounced creature

Requires Layer 1 copy effects:
- Token copies all characteristics of the original (as it last existed on battlefield via LKI)
- Layer 1 sets the base characteristics of the token to match the copied creature

Depends: P0.4 (LKI), P0.11, P2.1, P3.2
Test:
1. Supplant Form on Dandan → Dandan returned to hand, token copy of Dandan created.
2. Token has all Dandan characteristics (4/1, islandwalk, restrictions).
3. Token is a token (not a card) — won't return to hand if bounced.
4. LKI used for copy characteristics (what Dandan looked like on battlefield).
Acceptance: Bounce + token copy works, Layer 1 correctly applies.

### P5.3 — Layer 1: copy effects

**Files**: `effects/continuous/layers.ts` (extend)

Implement Layer 1 for copy effects:
- Copy effect sets the base characteristics of an object to match the copied object
- Applied first (before all other layers)
- Used by Supplant Form token copy
- Token base = copied creature's characteristics (from LKI or current state)

Depends: P3.2, P0.4
Test:
1. Token copy of Dandan → Layer 1 sets base to Dandan stats, then other layers apply on top.
2. Copy of a creature with continuous effects → copy gets the base, not the derived.
Acceptance: Layer 1 copy is correctly ordered before other layers.

### P5.4 — Card: Metamorphose

**Files**: `cards/metamorphose.ts`

Cards: **Metamorphose** (counter target permanent spell, its controller draws a card... actually: put target permanent on top of library, its controller draws a card)

<!-- TODO: Metamorphose Oracle text: "Put target permanent on top of its owner's library, then that permanent's controller reveals cards from the top of their library until they reveal a permanent card. They put that card onto the battlefield and shuffle the rest into their library." This is significantly more complex than "counter + draw". Re-read the architecture doc's characterization ("Counter + top-of-library + draw") — it may be simplified/wrong. Verify Oracle text and implement accordingly. If the architecture doc is inaccurate, implement per Oracle and note the discrepancy. -->

Depends: P0.6, P0.7, P0.11, P2.1
Test: TBD after verifying Oracle text.
Acceptance: Matches Oracle text behavior with shared-deck semantics.

### P5.5 — Card: Unsubstantiate

**Files**: `cards/unsubstantiate.ts`

Cards: **Unsubstantiate** (return target spell or creature to hand)

Implement:
- CardDefinition: instant, {1}{U}, `onResolve`:
  - `MOVE_ZONE` target from battlefield or stack to owner's hand
  - Can target: creature on battlefield OR spell on stack (modal targeting)

Depends: P0.11, P2.1
Test:
1. Bounce creature from battlefield → goes to hand.
2. Bounce spell from stack → goes to hand (spell "countered" effectively).
3. Invalid target (neither creature nor spell) → rejected.
Acceptance: Dual-mode bounce works for both battlefield creatures and stack spells.

### P5.6 — Card: Vision Charm

**Files**: `cards/vision-charm.ts`

Cards: **Vision Charm** (modal: mill 4 / make artifact a type until EOT / phase out target)

Implement:
- CardDefinition: instant, {U}, `onResolve`:
  - Mode choice: `PendingChoice { type: 'CHOOSE_MODE'; modes: [mill, typeChange, phaseOut] }`
  - Mode 1: mill top 4 of target player's library → graveyard (shared library in variant)
  - Mode 2: choose artifact, choose basic land type, artifact becomes that type until EOT
  - Mode 3: target permanent phases out

<!-- TODO: Phase out mechanics — do any other cards in the 80-card deck interact with phasing? If not, implement a minimal phase-out: remove from battlefield temporarily, return at beginning of owner's next untap step. Phased-out permanents are treated as though they don't exist. This is a significant mechanic — define the minimal scope needed. -->

Depends: P0.6, P0.7, P0.11, P2.1, P2.2
Test:
1. Mode 1: mill 4 from shared library.
2. Mode 2: artifact becomes land type.
3. Mode 3: permanent phases out (leaves battlefield, returns next untap).
Acceptance: All three modes work.

### P5.7 — Card: Mystic Retrieval

**Files**: `cards/mystic-retrieval.ts`

Cards: **Mystic Retrieval** (return instant/sorcery from graveyard to hand; flashback {2}{R})

Implement:
- CardDefinition: sorcery, {3}{U}, `onResolve`:
  - `CHOOSE_CARDS { candidates: instants/sorceries in graveyard; min: 1; max: 1 }`
  - `MOVE_ZONE` chosen card from graveyard to hand
- Flashback: `{ cost: { C: 2, R: 1 }; zone: 'graveyard' }`
  - Can be cast from graveyard for flashback cost
  - If cast via flashback, exile instead of going to graveyard after resolution

<!-- TODO: Flashback implementation — need to define: (1) ActivatedAbilityAst variant for flashback, (2) alternative casting from graveyard, (3) replacement effect: "if this would go anywhere from stack, exile it instead" when cast via flashback. This is a significant subsystem — flashback is used by Mystic Retrieval only in this deck, but needs clean implementation for correctness. -->

Depends: P0.7, P0.11, P2.1, P2.2, P2.5 (replacement for exile-on-resolve)
Test:
1. Cast from hand → return instant/sorcery from shared graveyard to hand.
2. Cast via flashback from graveyard → same effect, then exiled instead of going to graveyard.
3. Flashback cost is {2}{R} (red mana in a blue deck — from Izzet Boilerworks or Crystal Spray'd lands).
Acceptance: Both normal cast and flashback work with shared-deck graveyard.

### P5.8 — Cards: Cycling lands (Lonely Sandbar, Remote Isle)

**Files**: `cards/lonely-sandbar.ts`, `cards/remote-isle.ts`

Cards: **Lonely Sandbar** (cycling {U}), **Remote Isle** (cycling {U})

Implement:
- Both are lands that enter tapped and tap for {U}
- Activated ability: cycling {U} — discard this card (from hand), draw a card
- Cycling is an activated ability from hand, not from battlefield
- Uses the stack (it's not a mana ability)

Depends: P0.11, P1.5, P2.1
Test:
1. Cycle from hand → pay {U}, discard land, draw card.
2. Cycling from battlefield → not legal (only from hand).
3. Play as land → enters tapped, taps for {U}.
Acceptance: Both cycling modes work (play as land, cycle from hand).

### P5.9 — Card: Svyelunite Temple

**Files**: `cards/svyelunite-temple.ts`

Cards: **Svyelunite Temple** (enters tapped, {T}: add {U}, sacrifice: add {U}{U})

Implement:
- CardDefinition: land, enters tapped
- Mana ability 1: `{T}: Add {U}`
- Activated ability: sacrifice Svyelunite Temple: Add {U}{U} (this IS a mana ability since it produces mana)

Depends: P0.11, P1.5
Test:
1. Play → enters tapped.
2. Next turn: tap for {U}.
3. Sacrifice → adds {U}{U} to pool, temple goes to graveyard.
Acceptance: Both mana abilities work, sacrifice is a mana ability (doesn't use stack).

### P5.10 — ETB lookahead (if needed)

**Files**: `effects/replacement/etbLookahead.ts`

Implement per §16 if any card in the deck requires CR 614.12 semantics:
- `previewEnterBattlefield(state, enteringObject, destination): EnterPreview`
- Creates hypothetical view of object on battlefield
- Determines applicable replacement effects and ETB triggers

Architecture doc notes: "Full CR 614.12 lookahead is needed only if a future card has 'as this enters' replacement semantics. The data structures support it; implementation can be deferred."

<!-- TODO: Review all 23 cards — do any have "as this enters" or replacement effects that modify how they enter the battlefield? Halimar Depths enters tapped (static ability, not replacement). Svyelunite Temple enters tapped. These are likely handled without full lookahead. If no card needs it, skip this task and leave the stub file with a TODO for future expansion. -->

Depends: P3.2, P2.5
Test: If implemented, test that entering object's hypothetical view is computed correctly.
Acceptance: Stub exists at minimum; full implementation only if deck requires it.

### P5.11 — Full dependency resolution expansion

**Files**: `effects/continuous/dependency.ts` (extend if needed)

Expand dependency resolution beyond Layer 3 if card interactions demand it:
- Layer 2 dependency (unlikely in this deck)
- Layer 4 dependency (possible with Dance of the Skywise + type interactions)
- Layer 6 dependency (possible with ability grants that depend on types)

<!-- TODO: Enumerate specific cross-layer dependency scenarios in this 80-card deck. If none exist, this task is "verify no scenarios exist and document that dependency resolution is only needed for Layer 3." -->

Depends: P3.5, P3.14
Test: If expanded, test the specific scenarios that triggered expansion.
Acceptance: All deck interactions with dependency are covered.

### P5.12 — Integration test: remaining cards

Test all remaining cards not covered by prior integration tests:
- Diminishing Returns with shared graveyard (full scenario)
- Supplant Form on Dandan (bounce + copy)
- Vision Charm each mode
- Mystic Retrieval flashback from graveyard
- Cycling lands cycle + play

Depends: all P5 tasks
Test: Scenario tests in `test/integration/full-deck.test.ts`.
Acceptance: Every one of the 23 unique cards loads, casts, resolves, and behaves correctly.

---

## Phase 6 — View projection + networking + replay

### P6.1 — projectView implementation

**Files**: `view/projection.ts`

Implement per §13:
- `projectView(state: GameState, forPlayer: PlayerId): GameView`
- Redaction rules:
  - Own hand: full contents
  - Opponent hand: count only
  - Shared library: count only (no card order, no card identities)
  - Shared graveyard: full (public)
  - Battlefield: full (public) — use `computeGameObject` for derived views
  - Exile: face-up cards full
  - Stack: full (public)
  - `rngSeed`: never included
  - `pendingChoice`: only if `forPlayer` matches `PendingChoice.forPlayer`

Depends: P0.3, P3.2
Test:
1. Project for player 1 → sees own hand, not opponent's.
2. Library count correct, no card data.
3. rngSeed absent from view.
4. Pending choice visible only to choosing player.
Acceptance: No hidden information leaks in projected view.

### P6.2 — projectEvent implementation

**Files**: `view/projection.ts` (extend), `view/redaction.ts`

Implement per §13:
- `projectEvent(event: GameEvent, forPlayer: PlayerId): RedactedGameEvent`
- Redaction rules:
  - `CARD_DRAWN` for opponent → strip `cardId`
  - `SHUFFLED` → strip `resultOrder`
  - `ZONE_CHANGE` library → hand for opponent → strip card identity
  - `RNG_CONSUMED` → never sent to clients

Depends: P0.5
Test:
1. Opponent draws → event has no cardId for the observing player.
2. Shuffle → no order in redacted event.
3. Own draw → cardId present.
Acceptance: Event redaction is correct per player perspective.

### P6.3 — Event-stream replication protocol

**Files**: `view/projection.ts` (extend or new file)

Design and implement:
- Server sends `projectEvent(event, playerId)` for each new event per connected player
- Event ordering guarantees (events arrive in `seq` order)
- Batching: multiple events from a single `processCommand` call sent as a batch
- Client consumption contract: apply events sequentially to rebuild state

<!-- TODO: This task borders on server integration (apps/server). Define the boundary: the game-engine package exports the projection functions; the server package calls them. The replication protocol itself may belong in apps/server, not game-engine. Decide scope. -->

Depends: P6.1, P6.2
Test: Unit test: project a batch of events for both players, verify correct redaction per player.
Acceptance: Event stream can be consumed to rebuild projected state.

### P6.4 — Reconnect snapshot protocol

Implement per §13:
- On reconnect: server sends `projectView(currentState, playerId)` as full snapshot
- Client replaces local state with snapshot
- Normal event streaming resumes

<!-- TODO: Same scope question as P6.3 — reconnect is a server concern. Game-engine provides projectView; server handles the reconnect flow. This task may be just "verify projectView is a complete snapshot" or it may need additional work. -->

Depends: P6.1
Test: Project view after N commands → snapshot is complete and consistent.
Acceptance: Snapshot alone is sufficient to rebuild full client state.

### P6.5 — Replay tooling

Implement:
- Replay: given initial state + event stream, rebuild state at any point
- `replayEvents(initialState: GameState, events: GameEvent[]): GameState`
- Engine version compatibility check: compare `EventEnvelope.engineVersion` with current

Depends: P0.5, P0.3
Test:
1. Play a full game, record events.
2. Replay events from initial state → final state matches.
3. Mismatched engine version → warning/error.
Acceptance: Replay produces identical state.

### P6.6 — Hidden information audit

Run a comprehensive audit:
- For every event type, verify `projectEvent` never leaks hidden info
- For `projectView`, verify no library order, no opponent hand contents, no RNG seed
- For reconnect, verify snapshot is correctly redacted

Depends: P6.1, P6.2
Test: Property test — for any `GameState`, `projectView(state, p1)` never contains p2's hand contents, library order, or rngSeed. Same for events.
Acceptance: No hidden information leaks found.

---

## Phase 7 — Testing hardening + polish

### P7.1 — Determinism test suite

Per test strategy:
- Same seed + same command sequence → identical event stream and state hash
- Run 100 randomized games, replay each, verify determinism

**Files**: `test/determinism/determinism.test.ts`

Depends: P0.6, P0.10, all prior phases
Test:
1. Play game with seed A and commands [C1..CN] → events E1 and state hash H1.
2. Replay with same seed A and commands [C1..CN] → events E2 and state hash H2.
3. E1 === E2 and H1 === H2.
Acceptance: 100% determinism over 100 randomized games.

### P7.2 — Per-card sanity tests

Per test strategy (adapted from SabberStone):
- For each of 23 unique cards: load definition, create game state, cast in harness, resolve
- Assert: no crash, expected zone changes, card-specific invariants

**Files**: `test/cards/sanity.test.ts` (generated or parameterized)

Depends: all card implementations
Test: Each card loads, casts, resolves without crash.
Acceptance: All 23 cards pass sanity checks.

### P7.3 — Scenario tests for complex interactions

Per §Appendix (8 key interactions):

1. **Mind Bend on Dandan** — Layer 3 rewrites all tokens, behavior changes
2. **Crystal Spray + Mind Bend on same permanent** — Layer 3 dependency ordering
3. **Brainstorm with shared library** — multi-choice persisted resolution
4. **Ray of Command stealing Dandan mid-combat** — Layer 2 + untap + must-attack
5. **Memory Lapse on opponent's spell** — counter + shared library top
6. **Predict naming card in shared library** — name choice + conditional draw
7. **Supplant Form on Dandan** — bounce + Layer 1 copy token
8. **Diminishing Returns with shared graveyard** — multi-zone shared-deck hooks

**Files**: `test/scenarios/` — one file per interaction

Depends: all prior phases
Test: Each scenario has explicit setup, actions, and expected outcomes.
Acceptance: All 8 key interactions pass.

### P7.4 — Property-based tests

Per test strategy:
- SBA loop termination: no infinite loops
- Replacement effect loop termination: apply-once guarantees termination
- State consistency invariants:
  - All objectIds in zones exist in objectPool
  - All objectPool entries have valid zone references
  - No stale ObjectRefs in active effects (or they're gracefully handled)

**Files**: `test/properties/invariants.test.ts`

<!-- TODO: Choose a property-testing library. Options: fast-check (most popular for TS), or a simpler custom approach. fast-check is recommended for generating random game states and command sequences. -->

Depends: all prior phases
Test: Run 1000+ random scenarios, verify invariants hold.
Acceptance: No invariant violations found.

### P7.5 — Replacement/choice torture tests

Per test strategy:
- Nested replacement effects: replacement that triggers another replacement
- Choice ordering: multiple simultaneous choices resolved in correct order
- Edge cases: empty whiteboard, zero-action pipeline, etc.

**Files**: `test/properties/replacement-torture.test.ts`

Depends: P2.4, P2.5
Test: Exhaustive edge cases for replacement + choice interaction.
Acceptance: No crashes or infinite loops.

### P7.6 — Layer ordering targeted tests

Per test strategy:
- Mind Bend + Crystal Spray on same permanent (Layer 3 dependency)
- Cross-layer interactions (Layer 3 affects Layer 6 ability content)
- Timestamp ordering within layers

**Files**: `test/layers/ordering.test.ts`

Depends: P3.5, P3.14
Test: Specific layer ordering scenarios produce expected derived views.
Acceptance: Layer ordering matches MTG CR 613.

### P7.7 — Regression test infrastructure

Set up:
- Convention: every fixed bug gets a test in `test/regression/`
- Test naming: `{issue-number}-{brief-description}.test.ts`
- These tests are preserved forever

**Files**: `test/regression/` directory, testing conventions documented

Depends: none (can be set up any time)
Test: Infrastructure exists, convention documented.
Acceptance: First regression test can be written and runs.

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

## Open TODOs summary

Collected from `<!-- TODO -->` markers above — items needing clarification before or during implementation:

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
20. **P5.1** — Diminishing Returns: "you lose 1 life" — caster only, confirm
21. **P5.4** — Metamorphose: actual Oracle text vs architecture doc characterization
22. **P5.6** — Vision Charm phase out: minimal scope needed
23. **P5.7** — Flashback subsystem design (alternative cost + exile replacement)
24. **P5.10** — ETB lookahead: review if any card needs CR 614.12
25. **P5.11** — Cross-layer dependency scenarios enumeration
26. **P6.3** — Event-stream replication: game-engine vs server scope boundary
27. **P6.4** — Reconnect protocol: game-engine vs server scope boundary
28. **P7.4** — Property-testing library selection (fast-check recommended)
