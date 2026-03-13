# Rules Engine Implementation: Phase 0 — Foundations (determinism + identity + mode)

Status: complete

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

<!-- TODO: For `determineOwner` on draw: confirm whether the drawn card's owner becomes the drawing player. Track the answer in docs/overview/open-questions.md until the variant rule is finalized. -->

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
