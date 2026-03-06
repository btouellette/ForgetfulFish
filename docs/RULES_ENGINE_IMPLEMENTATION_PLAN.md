# Rules Engine Implementation Plan

Granular task breakdown derived from `docs/RULES_ENGINE_ARCHITECTURE.md`. Each task is
numbered within its phase (e.g., P0.1, P0.2) and designed to be independently verifiable.
Tasks within a phase are ordered by dependency — earlier tasks unblock later ones.

**Conventions**
- File paths are relative to `packages/game-engine/src/`.
- Test file paths are relative to `packages/game-engine/test/`.
- "§N" references a section in `RULES_ENGINE_ARCHITECTURE.md`.
- `<!-- TODO: ... -->` marks items needing further clarification before implementation.
- "Cards:" lists which of the 23 unique cards a task unblocks.
- "Depends:" lists prerequisite tasks.
- "Test:" describes the test file(s), what to test, and the expected behavior — **written BEFORE implementation code**.
- "Acceptance:" describes the concrete success condition beyond tests.
- Mode-portability guardrail: kernel/state tasks must target logical zones through `GameMode` zone routing and must not hardcode shared-library/shared-graveyard assumptions.
- Backward-compat note: if any future task text reintroduces `resolveLibrary`/`resolveGraveyard`, implement it via `resolveZone` adapters to preserve plan continuity while avoiding lock-in.
- Interpretation rule: when a task says "shared library" or "shared graveyard," treat that as a SharedDeckMode expectation in tests, not as an implementation directive.

**Current baseline**: `packages/game-engine/` has `src/state.ts` (basic `PlayerState`,
`GameState` stub, `createInitialGameState`), `src/index.ts` (re-exports), and
`test/state.test.ts`. Everything below is greenfield.

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
- If a category depends on a later subsystem (for example, layer/replacement interactions before those phases exist), mark it deferred in the card test file and track it for completion in Phase 7.
- By Phase 7 (`P7.2`), every card must pass all 7 categories with no deferrals.

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
- [ ] Any blocked categories are explicitly marked with the task/phase that unblocks them
- [ ] Minimum 8 test cases implemented
- [ ] `assertStateInvariants` called in every test
- [ ] Card has full 7-category coverage by `P7.2`

---

## Phase 0 — Foundations (determinism + identity + mode)

### [x] P0.1 — Core type definitions: ObjectRef, ObjectId, ZoneRef

**Files**: `state/objectRef.ts`, `state/zones.ts`

Define:
- `ObjectId` (string type alias)
- `ObjectRef { id: ObjectId; zcc: number }` per §2
- `ZoneKind` union: `'library' | 'graveyard' | 'battlefield' | 'exile' | 'stack' | 'hand'`
- `ZoneScope` union: `{ scope: 'shared' } | { scope: 'player'; playerId: PlayerId }`
- `ZoneRef`: `{ kind: ZoneKind } & ZoneScope`
- `ZoneKey` serializer helper (stable key for `ZoneRef`, e.g. `shared:library`, `player:p1:graveyard`)
- `PlayerId` (string type alias)
- Zone-change helper: `bumpZcc(obj: GameObject): GameObject` — returns new object with incremented `zcc`

**Test file**: `test/state/objectRef.test.ts`
Depends: none
Test: **Write tests FIRST**, then implement.
1. `ObjectId` can be constructed and treated as string.
2. `ObjectRef` equality comparison (same ID and ZCC).
3. `ObjectRef` inequality (different ID or different ZCC).
4. `bumpZcc` on object with `zcc=0` returns new object with `zcc=1`.
5. `ZoneRef` supports both shared and player-scoped variants for the same logical zone kind.
6. `ZoneKey` serialization is deterministic and unique per `ZoneRef`.
Acceptance: Types compile, tests pass, exported from `index.ts`.

### [x] P0.2 — GameObject and GameObjectBase types

**Files**: `state/gameObject.ts`

Define per §1:
- `GameObjectBase { id: ObjectId; zcc: number; cardDefId: string; owner: PlayerId; controller: PlayerId; counters: Map<string, number>; damage: number; tapped: boolean; summoningSick: boolean; attachments: ObjectId[]; abilities: AbilityAst[]; zone: ZoneRef }`
- `GameObjectView` (derived/computed view — same shape, populated by layer system later)
- `GameObject = GameObjectBase` initially (view computation added in Phase 3)

<!-- TODO: Determine whether `abilities: AbilityAst[]` should live on GameObjectBase or only appear after card definition hydration. The architecture doc shows it on GameObject — verify this is the base copy, not just the derived view. -->

**Test file**: `test/state/gameObject.test.ts`
Depends: P0.1
Test: **Write tests FIRST**, then implement.
1. Construct `GameObjectBase` with all required fields.
2. Verify all fields are accessible and correctly typed.
3. Test default values for `counters` Map (starts empty) and `attachments` array (starts empty).
4. `GameObjectView` type derivation from `GameObjectBase`.
5. AbilityAst array can be empty or populated with stub data.
6. Object reference equality for the same object instance.
Acceptance: Types compile, exported.

### [x] P0.3 — Full GameState type

**Files**: `state/gameState.ts` (new file replacing current `state.ts`)

Define the complete `GameState` per §1:
- `id`, `version`, `engineVersion`
- `rngSeed: string`
- `mode: GameMode` (interface reference, implemented in P0.7)
- `players: [PlayerInfo, PlayerInfo]` with `id`, `life`, `manaPool`, `hand: ObjectId[]`, `priority: boolean`
- `zones: Map<ZoneKey, ObjectId[]>` (mode-provided zone registry)
- `zoneCatalog: ZoneRef[]` (all zones active for the current mode)
- `objectPool: Map<ObjectId, GameObject>`
- `stack: StackItem[]` (type stub — fleshed out in Phase 2)
- `turnState: TurnState { activePlayerId, phase, step, priorityState, attackers, blockers, landPlayedThisTurn }`
- `continuousEffects: ContinuousEffect[]` (type stub — fleshed out in Phase 3)
- `pendingChoice: PendingChoice | null` (type stub — fleshed out in Phase 2)
- `lkiStore: Map<string, LKISnapshot>`
- `triggerQueue: TriggeredAbility[]` (type stub — fleshed out in Phase 4)

Migrate existing `createInitialGameState` to use the new types. Update existing test in
`test/state.test.ts` to match.

`players[].hand` remains a compatibility view during migration; zone arrays in `zones` are the canonical mutation source for engine logic.

<!-- TODO: Define Phase and Step enums (UNTAP, UPKEEP, DRAW, MAIN_1, BEGIN_COMBAT, DECLARE_ATTACKERS, DECLARE_BLOCKERS, COMBAT_DAMAGE, END_COMBAT, MAIN_2, END, CLEANUP). Check whether a single Phase enum with Step sub-enum is cleaner or if flat enum is better for pattern matching. -->

**Test file**: `test/state/gameState.test.ts`
Depends: P0.1, P0.2
Test: **Write tests FIRST**, then implement.
1. `GameState` construction with all top-level fields populated.
2. `createInitialGameState` produces valid `GameState` with mode-provided zones initialized and empty.
3. `PlayerInfo` initialization (defaults: 20 life, zero mana, empty hand).
4. `turnState` initialization (active player set, phase=UNTAP, landPlayed=false).
5. `objectPool` is a Map and starts empty.
6. `assertStateInvariants` (P0.14) passes on a freshly created initial state.
Acceptance: Existing `state.test.ts` updated and passing with new types.

### [x] P0.4 — LKI snapshot types and helpers

**Files**: `state/lki.ts`

Define per §2:
- `LKISnapshot { ref: ObjectRef; zone: ZoneRef; base: GameObjectBase; derived: GameObjectView }`
- `captureSnapshot(obj: GameObject, derivedView: GameObjectView, zone: ZoneRef): LKISnapshot`
- `lookupLKI(store: Map<string, LKISnapshot>, id: ObjectId, zcc: number): LKISnapshot | undefined`
- Key format: `"${id}:${zcc}"`

**Test file**: `test/state/lki.test.ts`
Depends: P0.1, P0.2
Test: **Write tests FIRST**, then implement.
1. `captureSnapshot` correctly creates `LKISnapshot` from a `GameObject`.
2. `lookupLKI` finds the correct snapshot by `id:zcc` key.
3. `lookupLKI` returns `undefined` when queried with a wrong `zcc`.
4. `lookupLKI` returns `undefined` for a non-existent `id`.
5. Snapshot contains identical base and derived views (initially).
6. Key format verification: `"${id}:${zcc}"` exactly.
Acceptance: Tests pass, exported.

### [x] P0.5 — Event types and EventEnvelope

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

**Test file**: `test/events/event.test.ts`
Depends: P0.1 (needs ObjectRef, PlayerId, ZoneRef for event payloads)
Test: **Write tests FIRST**, then implement.
1. Construct each of the 18 `GameEventPayload` variants.
2. Discriminated union narrows correctly in switch/pattern match.
3. `createEvent` produces stable ID from `gameId` and `seq`.
4. `EventEnvelope` fields are correctly populated and immutable.
5. Exhaustiveness check via `never` type in a switch statement default case.
6. Sequence numbers are correctly assigned and monotonic.
Acceptance: All event types compile, exhaustiveness check via `never` in switch default.

### [x] P0.6 — Seeded deterministic RNG

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

**Test file**: `test/rng/rng.test.ts`
Depends: none
Test: **Write tests FIRST**, then implement.
1. Same seed produces identical sequence of 1000 `next()` calls.
2. `nextInt(min, max)` boundary check where `min === max` returns `min`.
3. `shuffle` of an empty array returns a new empty array.
4. `shuffle` of a single-element array returns a new identical array.
5. Statistical check: 1000 calls to `next()` are distributed within [0, 1).
6. `getSeed()` after operations allows resumption with same continuation sequence.
Acceptance: Determinism tests pass. No external dependencies (pure implementation).

### [x] P0.7 — GameMode interface, zone policy, and shared-deck baseline

**Files**: `mode/gameMode.ts`, `mode/sharedDeck.ts`

Define per §14 (updated for future modes):
- `GameMode` interface with `id`, `resolveZone`, `createInitialZones`, `simultaneousDrawOrder`, `determineOwner`
  - `resolveZone(state, logicalZone, playerId?) => ZoneRef`
  - `createInitialZones(players) => { zoneCatalog: ZoneRef[]; zones: Map<ZoneKey, ObjectId[]> }`
- `SharedDeckMode` implementation:
  - `resolveZone(..., 'library', ...)` → shared library zone
  - `resolveZone(..., 'graveyard', ...)` → shared graveyard zone
  - `resolveZone(..., 'hand', playerId)` → player-scoped hand zone
  - `simultaneousDrawOrder` → alternating starting with active player
  - `determineOwner` → player who drew/played the card
- Add a lightweight conformance fixture mode in tests (for example `SplitZonesTestMode`) to prove non-shared library/graveyard routing works without kernel changes.

<!-- TODO: For `determineOwner` on draw: the variant rules say each player draws from the shared deck — does the drawn card's `owner` become the drawing player? Architecture doc §14 says yes (`'draw' | 'play'`). Confirm this matches the canonical Forgetful Fish variant rules in PROJECT_OVERVIEW.md. -->

**Test file**: `test/mode/sharedDeck.test.ts`
Depends: P0.1, P0.3 (needs GameState, PlayerId, ZoneRef)
Test: **Write tests FIRST**, then implement.
1. `SharedDeckMode.resolveZone(..., 'library', p1)` and `(..., 'library', p2)` both return shared-scoped library.
2. `SharedDeckMode.resolveZone(..., 'graveyard', p1)` and `(..., 'graveyard', p2)` both return shared-scoped graveyard.
3. `SharedDeckMode.resolveZone(..., 'hand', p1)` returns player-scoped hand for `p1`.
4. `simultaneousDrawOrder(4, 'p1')` returns `['p1','p2','p1','p2']`.
5. `determineOwner` for 'draw' action returns the drawing player's ID.
6. `SplitZonesTestMode.resolveZone(..., 'library', p1)` and `(..., 'library', p2)` return distinct player-scoped libraries.
Acceptance: Tests pass, mode can be injected into GameState, and kernel code remains unchanged between shared and split-zone mode fixtures.

Zone routing rules (apply to all downstream tasks):
- "your library/graveyard" routes via `mode.resolveZone(state, 'library' | 'graveyard', playerId)`.
- "owner's library" routes with `playerId = object.owner`.
- "controller's graveyard" (if used) routes with `playerId = object.controller`.
- Implementations may not directly construct shared-zone keys for library/graveyard behavior.

### [x] P0.8 — GameAction base types

**Files**: `actions/action.ts`

Define per §7:
- `ActionId` (string type alias)
- `ActionType` enum/union: `DRAW`, `MOVE_ZONE`, `DEAL_DAMAGE`, `COUNTER`, `SET_CONTROL`, `DESTROY`, `TAP`, `UNTAP`, `ADD_MANA`, `LOSE_LIFE`, `GAIN_LIFE`, `CREATE_TOKEN`, `SHUFFLE`
- `GameAction` base interface: `{ id: ActionId; type: ActionType; source: ObjectRef | null; controller: PlayerId; appliedReplacements: ReplacementId[] }`
- Per-type action interfaces (e.g., `DrawAction extends GameAction`, `MoveZoneAction extends GameAction { objectId: ObjectId; from: ZoneRef; to: ZoneRef; toIndex?: number }`)

<!-- TODO: Enumerate all action subtypes needed for the full 80-card deck. The architecture doc lists DRAW, MOVE_ZONE, DEAL_DAMAGE, COUNTER, SET_CONTROL as examples. Full list needs to cover: mana addition, life changes, token creation, shuffling, tapping/untapping, sacrificing (probably MOVE_ZONE to graveyard with sacrifice flag). -->

**Test file**: `test/actions/action.test.ts`
Depends: P0.1
Test: **Write tests FIRST**, then implement.
1. Construct one `GameAction` for each of the 13 defined types.
2. Verify `GameAction` base fields are present in all subtypes.
3. Discriminated union narrows correctly for subtype-specific fields (e.g., `MoveZoneAction`).
4. `appliedReplacements` array is initialized as empty.
5. `ActionId` uniqueness is maintainable.
6. Mandatory fields for each action type are enforced by TypeScript.
Acceptance: All action types compile and are exported.

### [x] P0.9 — Command types

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

**Test file**: `test/commands/command.test.ts`
Depends: P0.1
Test: **Write tests FIRST**, then implement.
1. Construct each `Command` variant using valid data.
2. `ChoicePayload` correctly encapsulates all required choice responses.
3. `BlockerAssignment` correctly maps attacker ObjectIds to blocker ObjectIds.
4. `Target` structure handles both `ObjectRef` and `PlayerId`.
5. TypeScript narrows command types correctly in switch statements.
Acceptance: Types compile, exported.

### [x] P0.10 — processCommand shell

**Files**: `engine/processCommand.ts`

Implement the entry point per §Entry point contract:
```
processCommand(state: Readonly<GameState>, command: Command, rng: Rng): CommandResult
```
- `CommandResult = { nextState: GameState; newEvents: GameEvent[]; pendingChoice?: PendingChoice }`
- Initial implementation: switch on `command.type`, delegate to stub handlers that return state unchanged.
- Wire up RNG: use the provided `rng` instance for all randomness, then write its advanced seed (via `rng.getSeed()`) back to `nextState.rngSeed`. Callers are responsible for constructing `rng` from `state.rngSeed` before invoking `processCommand`.

**Test file**: `test/engine/processCommand.test.ts`
Depends: P0.3, P0.5, P0.6, P0.9
Test: **Write tests FIRST**, then implement.
1. Call `processCommand` with `PASS_PRIORITY` returns expected structure.
2. `rngSeed` in `nextState` is updated if the RNG was consumed.
3. `rngSeed` is unchanged if no RNG consumption occurred.
4. `CommandResult` contains `nextState`, `newEvents`, and `pendingChoice` fields.
5. Passing a `Readonly<GameState>` ensures no mutation of the original object.
6. Exhaustiveness check for all command types in the switch.
Acceptance: Entry point callable, returns valid `CommandResult`.

### [x] P0.11 — Island card definition (reference implementation)

**Files**: `cards/cardDefinition.ts`, `cards/island.ts`, `cards/index.ts`

Define per §5:
- `CardDefinition` type with all fields from §5 (id, name, manaCost, typeLine, subtypes, color, supertypes, power, toughness, keywords, staticAbilities, triggeredAbilities, activatedAbilities, onResolve, continuousEffects, replacementEffects)
- `ManaCost` type (for Island: empty/zero)
- Island definition: basic land, type `['Land']`, subtype `[{ kind: 'basic_land_type', value: 'Island' }]`, activated ability for `{T}: Add {U}`
- Card registry in `cards/index.ts`: `Map<string, CardDefinition>`, initially containing only Island

<!-- TODO: Define `ActivatedAbilityAst` type for mana abilities. Island's "{T}: Add {U}" needs: cost (tap), effect (add mana). Mana abilities don't use the stack — this distinction matters for the kernel in Phase 1. The ability AST types (§8) need at minimum: KeywordAbilityAst, StaticAbilityAst, ActivatedAbilityAst, TriggerDefinitionAst. Define stubs for all four here; flesh out as cards need them. -->

**Test file**: `test/cards/island.test.ts`
Depends: P0.1, P0.8 (needs action types for the mana ability effect)
Test: **Write tests FIRST**, then implement.
1. Load Island definition from registry by the string ID "island".
2. Verify `typeLine` and `subtypes` match the specification for Island.
3. Verify mana ability AST structure (tap cost, add mana effect).
4. Registry returns `undefined` for non-existent card IDs.
5. Island satisfies the `CardDefinition` interface requirements.
6. Mana ability is correctly identified as a mana ability (no stack interaction).
7. Island has no mana cost (empty `ManaCost` object).
8. `pnpm typecheck` validates the registry map.
Acceptance: Card registry works, Island loads cleanly.

### [x] P0.12 — AbilityAst base types

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

**Test file**: `test/cards/abilityAst.test.ts`
Depends: P0.1
Test: **Write tests FIRST**, then implement.
1. Construct a `KeywordAbilityAst` for islandwalk.
2. Construct a `StaticAbilityAst` for Dandan's attack restriction.
3. Verify `Duration` union variants are correctly typed and assignable.
4. `Color` and `BasicLandType` atoms are correctly discriminated.
5. `TextChangeEffect` structure supports targeting an `ObjectRef`.
6. `ConditionAst` correctly represents "defender controls Island".
Acceptance: All AST types compile, used by `CardDefinition` in P0.11.

### [x] P0.13 — Update index.ts exports and remove old state.ts

**Files**: `index.ts`, delete old `state.ts`

- Barrel-export all new modules from `index.ts`
- Remove the old `state.ts` (its types are superseded by `state/gameState.ts`)
- Update or remove `test/state.test.ts` if it was migrated in P0.3

**Test file**: `test/integration/foundations.test.ts`
Depends: all P0 tasks above
Test: **Write tests FIRST**, then implement.
1. All Phase 0 types and helpers are exportable from the package root.
2. No circular dependencies exist between foundational modules.
3. `pnpm typecheck` passes across the entire `game-engine` package.
4. Old `state.ts` references are removed or replaced.
Acceptance: Clean build, no dead imports, all new types accessible from package root.

### [x] P0.14 — State Invariant Checker utility

**Files**: `test/helpers/invariants.ts`

Implement a utility to verify game state integrity:
- `assertStateInvariants(state: GameState)` that checks:
  - All `objectId`s found in zone arrays must exist in `objectPool`.
  - All `objectPool` entries must have a `zone` reference matching their actual location.
  - No duplicate `objectId`s across different zones.
  - Player hand counts match the length of their respective zone arrays.
  - Mana pool values are non-negative.
  - Life totals are integers.

**Test file**: `test/helpers/invariants.test.ts`
Depends: P0.3
Test: **Write tests FIRST**, then implement.
1. Valid initial state passes all invariant checks.
2. State with "orphaned" object ID in a zone (missing from pool) fails.
3. State with object in pool but not assigned to any zone fails.
4. State with duplicate object ID in two different zones fails.
5. State with negative mana values in a player pool fails.
6. State with non-integer life total fails.
7. State where hand count does not match `hand` zone array length fails.
Acceptance: Utility reliably catches corrupt state in tests.

### [x] P0.15 — Property-Based Test Utilities

**Files**: `test/helpers/generators.ts`

Implement arbitrary generators using `fast-check` for automated testing:
- Generators for: `GameState`, `GameObject`, `ZoneRef`, `Command` sequences.
- Ensure generated states are diverse but internally consistent.

**Test file**: `test/helpers/generators.test.ts`
Depends: P0.3, P0.14
Test: **Write tests FIRST**, then implement.
1. Generated `GameState` objects always pass `assertStateInvariants`.
2. Generated `Command` objects are well-formed and match their type definitions.
3. Generators support shrinking for minimal reproduction of property failures.
4. Distribution of generated zones, card types, and player states is balanced.
5. Generated command sequences are valid according to command schemas.
Acceptance: Generators are ready for Phase 7 property testing.

---

## Phase 1 — Turn loop + priority + basic commands

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

<!-- TODO: First-turn draw skip — the variant rules in PROJECT_OVERVIEW.md should specify whether the starting player skips their first draw. Standard MTG: starting player skips. Verify this applies to Forgetful Fish. -->

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

## Phase 2 — Stack resolution + whiteboard + choices + action pipeline

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

### [ ] P2.6 — Target validation with ObjectRef staleness

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

### [ ] P2.7 — Card: Memory Lapse

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

### [ ] P2.8 — Card: Accumulated Knowledge

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

### [ ] P2.9 — Card: Brainstorm

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

### [ ] P2.10 — Card: Mystical Tutor

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

### [ ] P2.11 — Card: Predict

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

## Phase 3 — Continuous effects + layers

### [ ] P3.1 — ContinuousEffect type and registry

**Files**: `effects/continuous/layers.ts`

Define per §9:
- `ContinuousEffect { id; source: ObjectRef; layer: Layer; sublayer?: Sublayer; timestamp: number; duration: Duration; appliesTo: EffectTarget; apply: (view: GameObjectView) => GameObjectView; dependsOn?: (other, state) => boolean }`
- `Layer` enum: `COPY = 1, CONTROL = 2, TEXT = 3, TYPE = 4, COLOR = 5, ABILITY = 6, PT_SET = '7a', PT_ADJUST = '7b', PT_SWITCH = '7c'`
- `addContinuousEffect(state: GameState, effect: ContinuousEffect): GameState`
- `removeContinuousEffect(state: GameState, effectId: string): GameState`

**Test file**: `test/effects/continuous/layers.test.ts`
Depends: P0.1, P0.3, P0.12
Test: **Write tests FIRST**, then implement.
1. Added effect is present in `state.continuousEffects` with unique ID.
2. Removed effect is correctly absent from the array.
3. Effects are stored with correct `layer` and `timestamp` information.
4. Effect `appliesTo` filter correctly identifies valid targets.
5. Multiple effects can be tracked simultaneously.
6. `addContinuousEffect` does not mutate the original `GameState`.
Acceptance: CRUD for continuous effects works.

### [ ] P3.2 — computeGameObject (layer application engine)

**Files**: `effects/continuous/layers.ts` (extend)

Implement `computeGameObject(objectId, state): GameObjectView` per §9:
1. Start with base state from `objectPool`
2. Gather all `ContinuousEffect`s where `appliesTo` matches this object
3. Group by layer
4. Within each layer: sort by timestamp (default), or by dependency if `dependsOn` exists
5. Apply each effect's `apply` function in order
6. Return derived `GameObjectView`

Caching: skip for now (recompute each time) — per architecture doc, acceptable for ~15 permanents.

**Test file**: `test/effects/continuous/compute.test.ts`
Depends: P3.1, P0.2
Test: **Write tests FIRST**, then implement.
1. Object with no continuous effects returns a view identical to its base state.
2. Object with Layer 7a (P/T set) effect has correctly modified power/toughness in view.
3. Effects in Layer 3 (Text) and Layer 6 (Ability) are applied in numerical layer order.
4. Two effects in the same layer are applied according to their timestamps.
5. Derived view contains all fields from the `GameObjectBase`.
6. Dependency ordering (if any) overrides timestamp ordering within a layer.
Acceptance: Layer system produces correct derived views.

### [ ] P3.3 — Duration tracking and cleanup

**Files**: `effects/continuous/duration.ts`

Implement per §9:
- `cleanupExpiredEffects(state: GameState): GameState`
  - `until_end_of_turn` → removed during cleanup step
  - `while_source_on_battlefield` → removed when source leaves battlefield
  - `until_cleanup` → removed at specific turn's cleanup
  - `as_long_as` → removed when condition becomes false
  - `permanent` → never removed by duration (only by explicit removal)
- Hook into cleanup step (P1.2) and zone-change events

**Test file**: `test/effects/continuous/duration.test.ts`
Depends: P3.1, P1.2
Test: **Write tests FIRST**, then implement.
1. `until_end_of_turn` effect survives until the cleanup step, then is removed.
2. `while_source_on_battlefield` effect is removed immediately when its source leaves play.
3. `permanent` effect remains indefinitely across turn boundaries.
4. `until_cleanup` effect is removed at the start of the specified cleanup step.
5. `as_long_as` effect expires when its specified condition AST evaluates to false.
6. `cleanupExpiredEffects` generates a `CONTINUOUS_EFFECT_REMOVED` event for each removal.
Acceptance: Effects expire at correct times.

### [ ] P3.4 — Layer 2: control-changing effects

**Files**: `effects/continuous/controlChange.ts`

Cards: **Ray of Command** (partial — control change aspect)

Implement:
- Control change continuous effect:
  - Layer 2 application: changes `controller` field on GameObjectView
  - Duration: `until_end_of_turn` for Ray of Command
- `SET_CONTROL` action type: creates a Layer 2 continuous effect
- When control changes: update which player gets priority for choices involving the object

**Test file**: `test/effects/continuous/control.test.ts`
Depends: P3.1, P3.2, P0.8
Test: **Write tests FIRST**, then implement.
1. Applying a Layer 2 effect causes `computeGameObject` to return the new controller.
2. Control reverts to the original owner when the effect expires.
3. `SET_CONTROL` action correctly generates the required continuous effect.
4. Multiple control changes apply in timestamp order.
5. Control change triggers priority update for activated abilities.
6. `assertStateInvariants` passes after control modification.
Acceptance: Control changes work through the layer system.

### [ ] P3.5 — Layer 3: text-changing effects with dependency ordering

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

**Test file**: `test/effects/continuous/text.test.ts`
Depends: P3.1, P3.2, P0.12
Test: **Write tests FIRST**, then implement.
1. Mind Bend changing "Island" to "Swamp" on Dandan updates all matching tokens.
2. Crystal Spray changing one specific instance of "Island" to "Mountain" works correctly.
3. Multiple text changes in Layer 3 interact via dependency ordering.
4. Text change on a permanent correctly affects its triggered and activated abilities.
5. Dependency resolution handles cases where one change affects another's applicability.
6. Circular dependencies are broken using effect timestamps.
Acceptance: Layer 3 with dependency ordering works for Mind Bend + Crystal Spray interaction.

### [ ] P3.6 — Layer 4: type-changing effects

**Files**: `effects/continuous/typeChange.ts`

Cards: **Dance of the Skywise**

Implement:
- Type change continuous effect:
  - Layer 4 application: changes `typeLine`, `subtypes` on GameObjectView
  - Dance of the Skywise: target creature becomes Dragon base type with new types
- Interacts with Layer 7a (P/T set) for Dance of the Skywise's "4/4" component

**Test file**: `test/effects/continuous/type.test.ts`
Depends: P3.1, P3.2
Test: **Write tests FIRST**, then implement.
1. Dance of the Skywise on a creature changes its `typeLine` to `['Dragon']`.
2. Existing subtypes are replaced by the Dragon type (unless specified otherwise).
3. The effect correctly expires at the end of the turn.
4. Type change application occurs before Layer 6 and Layer 7.
5. Multiple type changes combine or overwrite based on timestamp.
6. `computeGameObject` reflects the new types in the derived view.
Acceptance: Type changing works, combined with P/T setting for Dance.

### [ ] P3.7 — Layer 6: ability adding/removing

**Files**: `effects/continuous/abilityChange.ts`

Cards: **Dandan** (has keywords — islandwalk, via Layer 6 application from static definition)

Implement:
- Ability modification in Layer 6:
  - Add keyword abilities (e.g., islandwalk)
  - Remove abilities
  - Modify existing abilities
- For Dandan: islandwalk is on the card definition, applied through Layer 6 computation

**Test file**: `test/effects/continuous/ability.test.ts`
Depends: P3.1, P3.2, P0.12
Test: **Write tests FIRST**, then implement.
1. Dandan correctly displays the islandwalk keyword in its computed view.
2. An effect that removes abilities (e.g., "loses all abilities") removes islandwalk.
3. Adding multiple keyword abilities (flying, first strike) works correctly.
4. Ability granting effects are applied after text and type changes.
5. Effects that grant an ability "as long as" a condition is met work.
6. `assertStateInvariants` holds during ability computation.
Acceptance: Keyword abilities appear/disappear correctly in derived views.

### [ ] P3.8 — Layer 7: P/T modifications

**Files**: `effects/continuous/ptChange.ts`

Implement all sublayers:
- Layer 7a: characteristic-defining abilities and P/T setting effects (Dance of the Skywise sets to 4/4)
- Layer 7b: P/T adjustments from counters and +N/+N effects
- Layer 7c: P/T switching

**Test file**: `test/effects/continuous/pt.test.ts`
Depends: P3.1, P3.2
Test: **Write tests FIRST**, then implement.
1. Layer 7a effect (Dance of the Skywise) sets a 4/1 creature to exactly 4/4.
2. Layer 7b adjustment (e.g., +1/+1 counter) on a 4/4 results in a 5/5.
3. Layer 7c switching on a 4/1 creature results in a 1/4 view.
4. All sublayers are applied in the correct sequence (7a → 7b → 7c).
5. Multiple 7b effects (e.g., two +1/+1 effects) are cumulative.
6. Negative power or toughness is handled correctly according to MTG rules.
Acceptance: P/T math is correct through all sublayers.

### [ ] P3.9 — Card: Dandan (full implementation)

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

**Test file**: `test/cards/dandan.test.ts`
Depends: P0.11, P0.12, P3.5 (so Mind Bend can rewrite tokens), P3.7
Test: **Write tests FIRST**, then implement.
1. (Definition) Dandan definition loads with 4/1 P/T and blue color.
2. (Casting) Casting requires {U}{U} and places Dandan on the battlefield.
3. (Resolution) Computed view shows islandwalk and the two static restrictions.
4. (Shared-deck) Islandwalk check targets the common library-owning player's lands.
5. (Interaction) Mind Bend changing "Island" to "Swamp" updates all three ability tokens.
6. (Interaction) Crystal Spray changing one instance only updates that one instance.
7. (Edge case) Casting Dandan into an empty battlefield (no Islands) results in immediate sacrifice trigger (Phase 4).
8. (State) `assertStateInvariants` passes on all Dandan operations.
Acceptance: Dandan's full ability structure is Layer-3-rewritable.

### [ ] P3.10 — Card: Ray of Command

**Files**: `cards/ray-of-command.ts`

Cards: **Ray of Command** (gain control of creature until EOT, untap it, it must attack)

Implement:
- CardDefinition: instant, {3}{U}, `onResolve`:
  - Step 0: `SET_CONTROL` action (target creature → controller becomes caster)
  - Step 1: `UNTAP` action on the creature
  - Step 2: Add continuous effect: "must attack this turn" (duration: until_end_of_turn)
- Creates Layer 2 continuous effect for control change

**Test file**: `test/cards/rayOfCommand.test.ts`
Depends: P0.11, P2.1, P3.4
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 4-mana blue instant.
2. (Casting) Targets a creature controlled by any player.
3. (Resolution) Caster gains control of the creature until end of turn.
4. (Resolution) The targeted creature becomes untapped.
5. (Resolution) A "must attack" continuous effect is applied to the creature.
6. (Shared-deck) Control change works for permanents owned by the shared deck.
7. (Interaction) The creature reverts to its previous controller at the cleanup step.
8. (State) `assertStateInvariants` holds throughout control duration.
Acceptance: Control change + untap resolve correctly, duration tracked.

### [ ] P3.11 — Card: Mind Bend

**Files**: `cards/mind-bend.ts`

Cards: **Mind Bend** (change one basic land type word or color word permanently)

Implement:
- CardDefinition: instant, {U}, `onResolve`:
  - Step 0: Emit choices for which word to change and what to change it to
  - Step 1: Create `TextChangeEffect` continuous effect with `duration: 'permanent'` in Layer 3

**Test file**: `test/cards/mindBend.test.ts`
Depends: P0.11, P2.1, P2.2, P3.5
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 1-mana blue instant.
2. (Casting) Targets any permanent on the battlefield.
3. (Resolution) Player chooses a word kind (BasicLandType) and the target replacement.
4. (Resolution) A Layer 3 `TextChangeEffect` is added with `permanent` duration.
5. (Interaction) On Dandan, changing "Island" to "Swamp" updates all occurrences.
6. (Interaction) Multiple Mind Bends can stack on the same permanent.
7. (Shared-deck) Text change correctly impacts shared-deck interactions (e.g., islandwalk).
8. (State) `assertStateInvariants` passes after permanent effect creation.
Acceptance: Permanent text change works on all instances.

### [ ] P3.12 — Card: Crystal Spray

**Files**: `cards/crystal-spray.ts`

Cards: **Crystal Spray** (change one instance of a basic land type or color word until EOT, draw a card)

Implement:
- CardDefinition: instant, {2}{U}, `onResolve`:
  - Step 0: Choose which instance and what to change
  - Step 1: Create `TextChangeEffect` with `duration: 'until_end_of_turn'`
  - Step 2: `DRAW` action (cantrip)

<!-- TODO: Crystal Spray targets "one" instance, not all. Need to define how the player selects which specific instance on the permanent to change. This requires enumerating the BasicLandType/Color tokens on the target's abilities and letting the player pick one. Define the UI/choice mechanism for this. -->

**Test file**: `test/cards/crystalSpray.test.ts`
Depends: P0.11, P2.1, P2.2, P3.5
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 3-mana blue instant.
2. (Resolution) Player picks one specific instance of a type/color word on a permanent.
3. (Resolution) A Layer 3 effect is created only for that specific instance.
4. (Resolution) Player draws 1 card from the shared library.
5. (Interaction) On Dandan, changing only the first "Island" word works as expected.
6. (Interaction) The effect correctly expires at end of turn.
7. (Edge case) Selecting a non-existent instance (if possible) is rejected.
8. (State) `assertStateInvariants` passes after cantrip draw.
Acceptance: Single-instance text change works, cantrip draws.

### [ ] P3.13 — Card: Dance of the Skywise

**Files**: `cards/dance-of-the-skywise.ts`

Cards: **Dance of the Skywise** (target creature becomes 4/4 Dragon with flying until EOT)

Implement:
- CardDefinition: instant, {1}{U}, `onResolve`:
  - Step 0: Create continuous effects on target creature:
    - Layer 4: type change to Dragon
    - Layer 6: gains flying
    - Layer 7a: base P/T set to 4/4
  - All with `duration: 'until_end_of_turn'`

**Test file**: `test/cards/danceOfTheSkywise.test.ts`
Depends: P0.11, P2.1, P3.6, P3.7, P3.8
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 2-mana blue instant.
2. (Casting) Targets a creature you control.
3. (Resolution) Creature's type becomes Dragon, and it gains flying.
4. (Resolution) Creature's power and toughness are set to exactly 4/4.
5. (Interaction) On Dandan, verify that existing abilities (islandwalk) are lost or kept correctly.
6. (Interaction) Multiple layers (4, 6, 7a) are all applied and expire at once.
7. (Interaction) Interacts correctly with +1/+1 counters (Layer 7b).
8. (State) `assertStateInvariants` passes before and after effect application.
Acceptance: Multi-layer effects (4 + 6 + 7a) all apply and expire together.

### [ ] P3.14 — Integration test: layer interactions

Wire together:
- Mind Bend on Dandan (Layer 3 rewriting all tokens)
- Crystal Spray on same Dandan (Layer 3 single-instance, dependency ordering)
- Dance of the Skywise on Dandan (Layers 4 + 6 + 7a)
- Verify `computeGameObject` produces correct result in each scenario

**Test file**: `test/integration/layer-interactions.test.ts`
Depends: P3.9, P3.10, P3.11, P3.12, P3.13
Test: **Write tests FIRST**, then implement.
1. Verify Mind Bend overrides base card text permanently.
2. Verify Crystal Spray + Mind Bend dependency resolution results in correct final text.
3. Verify Dance of the Skywise overrides Dandan's base P/T but allows Layer 7b modifications.
4. Verify complex interactions between type-changing and ability-granting effects.
5. `assertStateInvariants(state)` is checked after every action.
6. All duration-based removals happen at the correct phase (cleanup).
7. `computeGameObject` result is consistent with MTG layer rules.
Acceptance: All layer interactions produce correct derived views.

---

## Phase 4 — Combat + triggers + trigger ordering

### [ ] P4.1 — Declare attackers

**Files**: `engine/combat.ts`

Implement per §4:
- `DECLARE_ATTACKERS` command handling:
  - Validate: only creatures controlled by active player, not tapped, not summoning sick (unless haste)
  - "Must attack" enforcement (for Dandan, Ray of Command's temporary effect)
  - Move to attackers declared → give priority
- Emit events for attacker declaration

<!-- TODO: In two-player, there's only one possible defender. But Dandan has "can't attack unless defending player controls an Island" — this is checked at declaration time, not at resolution. Verify the attack legality check reads the computed (Layer 3-rewritten) condition, not the base card. -->

**Test file**: `test/engine/combat_attack.test.ts`
Depends: P1.2, P3.2, P3.9
Test: **Write tests FIRST**, then implement.
1. Declare Dandan as attacker when opponent controls an Island → legal.
2. Declare Dandan as attacker when opponent controls no Island → rejected.
3. Tapped creature or summoning sick creature cannot be declared as attacker.
4. "Must attack" requirement (from Dandan or Ray) is enforced.
5. Attacker declaration emits `DECLARE_ATTACKERS` event.
6. `assertStateInvariants` passes after attackers are declared.
Acceptance: Attacker legality is correct including Dandan restrictions.

### [ ] P4.2 — Declare blockers

**Files**: `engine/combat.ts` (extend)

Implement:
- `DECLARE_BLOCKERS` command handling:
  - Validate: defender's untapped creatures can block, evasion checks (islandwalk, flying)
  - Islandwalk: can't be blocked if defending player controls an Island (again, Layer 3-rewritable)
  - Flying: can only be blocked by creatures with flying or reach
- Block assignment (which blocker blocks which attacker)

**Test file**: `test/engine/combat_block.test.ts`
Depends: P4.1, P3.2, P3.7
Test: **Write tests FIRST**, then implement.
1. Dandan with islandwalk attacking a player with an Island → cannot be blocked.
2. Dandan with Mind-Bent swampwalk attacking a player with no Swamps → can be blocked.
3. Creature with flying can only be blocked by another creature with flying.
4. Block assignment correctly associates attackers with blockers.
5. Blockers must be untapped to be declared.
6. `assertStateInvariants` holds after blocking is finalized.
Acceptance: Evasion checks use computed (layer-derived) abilities.

### [ ] P4.3 — Combat damage assignment and resolution

**Files**: `engine/combat.ts` (extend)

Implement:
- Damage assignment for each attacker-blocker pair
- Unblocked attacker deals damage to defending player
- Blocked attacker deals damage to blocker(s), blocker deals damage to attacker
- Emit `DAMAGE_DEALT` and `LIFE_CHANGED` events
- After damage: SBA check (creatures with lethal damage die, players at 0 lose)

**Test file**: `test/engine/combat_damage.test.ts`
Depends: P4.1, P4.2, P1.8
Test: **Write tests FIRST**, then implement.
1. Unblocked Dandan (4/1) deals exactly 4 damage to the defending player.
2. Dandan blocked by another Dandan → both deal 4 damage and both are destroyed.
3. Player with 4 life taking 4 damage goes to 0 and loses via SBA.
4. Lethal damage on a creature correctly results in it moving to the shared graveyard.
5. Damage resolution emits correct `DAMAGE_DEALT` and `LIFE_CHANGED` events.
6. Multiple attackers/blockers resolve damage simultaneously.
7. `assertStateInvariants` passes after damage and SBA processing.
Acceptance: Combat damage math is correct, SBAs fire after damage.

### [ ] P4.4 — "Must attack if able" enforcement

**Files**: `engine/combat.ts` (extend)

Cards: **Dandan**, **Ray of Command** (temporary "must attack")

Implement per §4:
- During declare attackers step:
  - Identify all creatures with "must attack" requirement (from ability AST or continuous effect)
  - If player omits a "must attack" creature → invalid declaration
  - If "must attack" creature can't legally attack (e.g., Dandan restriction) → not forced

**Test file**: `test/engine/combat_constraints.test.ts`
Depends: P4.1, P3.2, P3.9, P3.10
Test: **Write tests FIRST**, then implement.
1. Dandan is in play and legal to attack → declaring no attackers is rejected.
2. Dandan cannot attack (opponent has no Islands) → player can safely pass attackers step.
3. Ray of Command creature has "must attack" → must be included in the declaration.
4. Multiple "must attack" creatures must all be declared if legal.
5. "Must attack" does not override tapping or summoning sickness.
6. `assertStateInvariants` passes after enforcing requirements.
Acceptance: "Must attack" enforcement accounts for impossibility exceptions.

### [ ] P4.5 — Trigger batching with APNAP ordering

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

**Test file**: `test/triggers/batch.test.ts`
Depends: P0.12, P2.2, P1.9
Test: **Write tests FIRST**, then implement.
1. A single trigger event correctly puts the trigger onto the stack.
2. Two triggers for the same player results in an `ORDER_TRIGGERS` pending choice.
3. APNAP ordering ensures active player's triggers go on the stack first (resolve last).
4. Trigger results in an SBA which triggers a new ability → cycle continues.
5. Triggers targeting objects use correct `zcc` for reference stability.
6. `assertStateInvariants` passes after the trigger batching cycle finishes.
Acceptance: APNAP ordering with player choice for simultaneous triggers.

### [ ] P4.6 — State-triggered abilities

**Files**: `triggers/trigger.ts` (extend), `engine/sba.ts` (extend)

Cards: **Dandan** ("when you control no Islands, sacrifice Dandan")

Implement:
- State-triggered abilities: triggered by a game state condition becoming true (not by an event)
- Check during SBA loop: for each permanent with state-triggered abilities, evaluate condition
- If condition true and trigger hasn't already been put on stack this SBA cycle → add to triggerQueue
- Dandan: condition = "controller controls no permanents with SubtypeAtom { kind: 'basic_land_type', value: <Layer-3-rewritten value> }"

**Test file**: `test/triggers/state.test.ts`
Depends: P4.5, P3.2, P3.9
Test: **Write tests FIRST**, then implement.
1. Dandan's sacrifice trigger does not fire if its controller has an Island.
2. Dandan's sacrifice trigger fires immediately when its controller's last Island is removed.
3. Mind Bend changing "Island" to "Swamp" causes the trigger to check for Swamps instead.
4. State-triggered abilities fire at most once per SBA cycle to prevent infinite loops.
5. Triggered ability is added to the stack via the APNAP batching system.
6. `assertStateInvariants` passes after state-trigger resolution.
Acceptance: State-triggered ability with Layer 3-rewritable token works.

### [ ] P4.7 — Card: Mystic Sanctuary (ETB trigger)

**Files**: `cards/mystic-sanctuary.ts`

Cards: **Mystic Sanctuary** (ETB: if you control 3+ Islands, return instant/sorcery from graveyard to top of library)

Implement:
- CardDefinition: land (Island subtype — enters untapped? check Oracle)
- ETB trigger:
  - Condition: controller controls 3 or more Islands (including Mystic Sanctuary itself)
  - Effect: `CHOOSE_CARDS` from instants/sorceries in graveyard + `MOVE_ZONE` to top of library

<!-- TODO: Mystic Sanctuary Oracle: "If you control three or more other Islands" — the word "other" means Mystic Sanctuary itself doesn't count. Verify the condition checks for 3+ OTHER Islands, not including itself. Also: in shared-deck, "your graveyard" → shared graveyard via GameMode. -->

**Test file**: `test/cards/mysticSanctuary.test.ts`
Depends: P0.11, P4.5, P2.2
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as a land with Island subtype.
2. (Casting) Playing as a land triggers the ETB effect.
3. (Resolution) Trigger fires only if controller has 3+ *other* Islands.
4. (Resolution) Player chooses an instant/sorcery from the shared graveyard.
5. (Resolution) Chosen card moves to the top (index 0) of the common library.
6. (Shared-deck) Search correctly accesses the shared graveyard.
7. (Edge case) If 0 instants/sorceries in graveyard, trigger produces no choice.
8. (State) `assertStateInvariants` passes after graveyard-to-library move.
Acceptance: ETB trigger fires conditionally, graveyard search works.

### [ ] P4.8 — Card: Halimar Depths (ETB trigger)

**Files**: `cards/halimar-depths.ts`

Cards: **Halimar Depths** (ETB: look at top 3, put back in any order)

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - Look at top 3 of shared library
  - `PendingChoice { type: 'ORDER_CARDS'; cards: top3 }` — player arranges them
  - Put back in chosen order

**Test file**: `test/cards/halimarDepths.test.ts`
Depends: P0.11, P4.5, P2.2
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as land that enters tapped.
2. (Casting) Triggers the "look at top 3" ability upon entering the battlefield.
3. (Resolution) Caster sees exactly the top 3 cards of the shared library.
4. (Resolution) Caster is prompted with an `ORDER_CARDS` choice.
5. (Resolution) Library top 3 are updated to match the chosen order.
6. (Shared-deck) Interaction correctly uses the shared library zone.
7. (Edge case) If library has <3 cards, caster sees and orders all remaining cards.
8. (State) `assertStateInvariants` passes after reordering.
Acceptance: ETB trigger with ordering choice works.

### [ ] P4.9 — Card: Temple of Epiphany (ETB trigger)

**Files**: `cards/temple-of-epiphany.ts`

Cards: **Temple of Epiphany** (ETB: scry 1)

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - Scry 1: look at top card of shared library
  - `PendingChoice { type: 'CHOOSE_CARDS'; candidates: [topCard]; min: 0; max: 1 }` — keep on top or put on bottom

<!-- TODO: Scry choice UX — scry is "look at top N, put any number on bottom in any order, rest on top in any order." For scry 1 it's binary: top or bottom. Define the choice type. Could use CHOOSE_YES_NO ("keep on top?") or CHOOSE_CARDS with special semantics. -->

**Test file**: `test/cards/templeOfEpiphany.test.ts`
Depends: P0.11, P4.5, P2.2
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as land that enters tapped.
2. (Casting) Triggers scry 1 upon entering.
3. (Resolution) Choosing 1 card (Keep) leaves it on top of the shared library.
4. (Resolution) Choosing 0 cards (Bottom) moves the top card to the bottom of the shared library.
5. (Shared-deck) Scry correctly uses the shared library.
6. (Interaction) Opponent does not see the card identity being scried.
7. (Edge case) Scrying an empty library does nothing.
8. (State) `assertStateInvariants` passes after scry completion.
Acceptance: Scry works with shared library.

### [ ] P4.10 — Card: Izzet Boilerworks (ETB trigger)

**Files**: `cards/izzet-boilerworks.ts`

Cards: **Izzet Boilerworks** (ETB: return a land you control to hand; tap for {U}{R})

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - `CHOOSE_CARDS { candidates: lands you control; min: 1; max: 1 }` — choose a land
  - `MOVE_ZONE` chosen land from battlefield to hand (bounce)
- Mana ability: `{T}: Add {U}{R}`

**Test file**: `test/cards/izzetBoilerworks.test.ts`
Depends: P0.11, P4.5, P2.2, P1.5
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as land that enters tapped.
2. (Casting) Triggers bounce choice upon entering.
3. (Resolution) Controller must choose a land they control to return to hand.
4. (Resolution) If Boilerworks is the only land, it must bounce itself.
5. (Resolution) Tapping for mana adds exactly one {U} and one {R} to the pool.
6. (Interaction) Bouncing a land with Mind Bend effects preserves the effect (permanent).
7. (Shared-deck) Ownership of the bounced land is determined by `GameMode`.
8. (State) `assertStateInvariants` passes after bounce.
Acceptance: ETB bounce + dual mana ability works.

### [ ] P4.11 — Integration test: combat with triggers

Wire together:
- Dandan attacks Dandan scenario (both must attack, combat damage kills both, sacrifice triggers)
- Mystic Sanctuary + Halimar Depths entering simultaneously (APNAP trigger ordering)
- Ray of Command stealing Dandan mid-combat

**Test file**: `test/integration/combat-triggers.test.ts`
Depends: all P4 tasks
Test: **Write tests FIRST**, then implement.
1. Verify Dandan vs Dandan results in both cards in shared graveyard and events emitted.
2. Verify APNAP ordering correctly handles simultaneous ETB triggers for different players.
3. Verify Ray of Command mid-combat correctly changes attacker/blocker legality.
4. Verify "must attack" is properly checked against current state restrictions.
5. `assertStateInvariants(state)` is called after every stack resolution and combat step.
6. Event log reflects correct ordering of combat damage and subsequent triggers.
7. State-triggered abilities (Dandan sacrifice) fire correctly after combat-related land losses.
Acceptance: Complex combat + trigger interactions work correctly.

---

## Phase 5 — Full deck completion + complex cards

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

## Phase 6 — View projection + networking + replay

### [ ] P6.1 — projectView implementation

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
  - `rngSeed`: never included
  - `pendingChoice`: only if `forPlayer` matches `PendingChoice.forPlayer`

**Test file**: `test/view/projection.test.ts`
Depends: P0.3, P3.2
Test: **Write tests FIRST**, then implement.
1. Projecting for Player 1 shows Player 1's hand but only a count for Player 2.
2. Library contents are hidden (count only) in the projected view.
3. `rngSeed` is completely removed from all projected views.
4. `pendingChoice` is visible only to the player who needs to make the choice.
5. Battlefield permanents show their derived `GameObjectView` (computed via layers).
6. Shared graveyard is fully visible to both players.
Acceptance: No hidden information leaks in projected view.

### [ ] P6.2 — projectEvent implementation

**Files**: `view/projection.ts` (extend), `view/redaction.ts`

Implement per §13:
- `projectEvent(event: GameEvent, forPlayer: PlayerId): RedactedGameEvent`
- Redaction rules:
  - `CARD_DRAWN` for opponent → strip `cardId`
  - `SHUFFLED` → strip `resultOrder`
  - `ZONE_CHANGE` library → hand for opponent → strip card identity
  - `RNG_CONSUMED` → never sent to clients

**Test file**: `test/view/redaction.test.ts`
Depends: P0.5
Test: **Write tests FIRST**, then implement.
1. `CARD_DRAWN` event for an opponent does not contain the `cardId`.
2. `SHUFFLED` event does not reveal the new order of the library.
3. `RNG_CONSUMED` events are filtered out and not sent to players.
4. `ZONE_CHANGE` (library to hand) for an opponent hides the card identity.
5. Own `CARD_DRAWN` event includes the correct `cardId`.
6. Public events (e.g., `LIFE_CHANGED`) are sent unredacted to both players.
Acceptance: Event redaction is correct per player perspective.

### [ ] P6.3 — Event-stream replication protocol

**Files**: `view/projection.ts` (extend or new file)

Design and implement:
- Server sends `projectEvent(event, playerId)` for each new event per connected player
- Event ordering guarantees (events arrive in `seq` order)
- Batching: multiple events from a single `processCommand` call sent as a batch
- Client consumption contract: apply events sequentially to rebuild state

**Test file**: `test/view/replication.test.ts`
Depends: P6.1, P6.2
Test: **Write tests FIRST**, then implement.
1. Multiple events are batched and redacted correctly for each player.
2. Events are emitted with monotonic `seq` numbers.
3. Sequence of redacted events allows a client to maintain a consistent state.
4. Client-side event application produces a state matching `projectView`.
5. Handling of missing sequence numbers (gap detection) is possible.
6. `assertStateInvariants` holds on the client-side reconstructed state.
Acceptance: Event stream can be consumed to rebuild projected state.

### [ ] P6.4 — Reconnect snapshot protocol

Implement per §13:
- On reconnect: server sends `projectView(currentState, playerId)` as full snapshot
- Client replaces local state with snapshot
- Normal event streaming resumes

**Test file**: `test/view/reconnect.test.ts`
Depends: P6.1
Test: **Write tests FIRST**, then implement.
1. `projectView` provides a complete and sufficient state for a reconnecting client.
2. Client successfully replaces stale state with the new snapshot.
3. Subsequent events apply correctly on top of the reconnected snapshot.
4. No data leakage occurs during the snapshot transmission.
5. Reconnect snapshot passes `assertStateInvariants`.
6. Multiple reconnects in a row are handled gracefully.
Acceptance: Snapshot alone is sufficient to rebuild full client state.

### [ ] P6.5 — Replay tooling

Implement:
- Replay: given initial state + event stream, rebuild state at any point
- `replayEvents(initialState: GameState, events: GameEvent[]): GameState`
- Engine version compatibility check: compare `EventEnvelope.engineVersion` with current

**Test file**: `test/view/replay.test.ts`
Depends: P0.5, P0.3
Test: **Write tests FIRST**, then implement.
1. Replaying a recorded event stream from the initial state produces the identical final state.
2. Replay at an intermediate point matches the historical state at that point.
3. Mismatched `engineVersion` in events results in a clear error or warning.
4. Replay handles `MAKE_CHOICE` and resumed resolutions correctly.
5. Event stream with gaps is detected and handled.
6. `assertStateInvariants` passes at every step of the replay.
Acceptance: Replay produces identical state.

### [ ] P6.6 — Hidden information audit

Run a comprehensive audit:
- For every event type, verify `projectEvent` never leaks hidden info
- For `projectView`, verify no library order, no opponent hand contents, no RNG seed
- For reconnect, verify snapshot is correctly redacted

**Test file**: `test/view/audit.test.ts`
Depends: P6.1, P6.2
Test: **Write tests FIRST**, then implement.
1. Exhaustive check of all event types for Player 1 vs Player 2 redaction.
2. Verification that `rngSeed` is never present in any projected object.
3. Verification that `objectPool` only contains derived views in the projection.
4. Verification that library order is never leaked via `ZONE_CHANGE` indices.
5. `PendingChoice` details for other players are never leaked.
6. Automated audit scan across 1000 generated game states.
Acceptance: No hidden information leaks found.

---

## Phase 7 — Testing hardening + polish

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
29. **P0.14** — State Invariant Checker: ensure all objectPool entries have valid zone references
30. **P0.15** — Property-Based Test Utilities: generate diverse but internally consistent GameStates
31. **P0.7** — Define `resolveZone` logical zone enum shape (`library | graveyard | hand | battlefield | exile | stack`) and whether to reserve future-only logical zones now.
