# Rules Engine Architecture

## Context

`packages/game-engine` is currently a placeholder with only a minimal `GameState` type. The
architecture document describes the intended pattern: `GameState` + `Command` + `Event` with
deterministic server-side execution. This document specifies the full rules engine design —
one that handles the complete Forgetful Fish card set now with no dead-ends as the game expands,
while remaining tractable for a small TypeScript team.

The design synthesises lessons from XMage, Forge, Magarena, MTG Arena, and Argentum (an
independent MTG engine in Kotlin).

---

## Why existing engines are hard to extend

| Engine | Core problem |
|--------|-------------|
| **XMage** | One Java class per card → >800 k lines, needs expert contributor per card |
| **Forge** | Global mutable zone variables → testing and debugging are painful |
| **Cockatrice** | No rules enforcement — players do it manually |
| **Magarena** | Single-player focus, Groovy scripts embedded in JVM |

## The key insight: MTG Arena's two-level model

MTG Arena (C++ + CLIPS) separates:

- **Game Rules Engine (GRE)** — knows MTG structure but is blind to individual cards: turn phases,
  priority, the stack, state-based actions, layers.
- **Effect System** — individual card rules as CLIPS rule objects that intercept the GRE's
  "task list" (the whiteboard).

The GRE writes a task ("destroy creatures A, B, C"), then "naps" while CLIPS rules modify the
whiteboard (remove indestructible creatures, exile unearthed ones instead), then the GRE wakes
and executes the result without ever knowing which rules fired.

Adapted to TypeScript this becomes a **Rules Kernel** plus a **Card Effect Registry**.

---

## Entry point contract

Everything flows through a single pure function:

```typescript
processCommand(
  state: Readonly<GameState>,
  command: Command,
  rng: Rng              // seeded, deterministic
): CommandResult        // { nextState, newEvents, pendingChoice? }
```

No mutation. No I/O. The server owns state storage and event persistence; the engine just transforms.

---

## 1. GameState — the complete snapshot

```
GameState
├── id, version, rngSeed
├── players[2]
│   ├── id, life, manaPool
│   ├── hand: ObjectId[]         // indices into objectPool
│   └── priority: boolean
├── zones
│   ├── library: ObjectId[]      // single shared library
│   ├── graveyard: ObjectId[]    // single shared graveyard
│   ├── battlefield: ObjectId[]
│   └── exile: ObjectId[]
├── objectPool: Map<ObjectId, GameObject>
│   └── GameObject: { cardDef, owner, controller, counters,
│                     tapped, summoningSick, attachments,
│                     abilities: Ability[], ... }
├── stack: StackItem[]           // spells and abilities
├── turnState
│   ├── activePlayerId
│   ├── phase, step
│   ├── attackers, blockers
│   └── landPlayedThisTurn
├── pendingChoice?: PendingChoice  // blocks priority until resolved
└── continuousEffects: ContinuousEffect[]
```

Key decisions:

- `objectPool` is a flat map by ID. Every zone holds IDs only. This avoids moving objects between
  typed arrays and enables the ECS pattern: attach/detach properties without changing object identity.
  Handles "a creature becomes a copy", "control change", and "Dandan gains flying" cleanly.
- Shared library and graveyard live in zones, not attached to a player. Ownership is tracked on
  `GameObject.owner`, not zone membership.
- `pendingChoice` is the mechanism for anything that requires player input mid-resolution.

---

## 2. Command — player intent

```typescript
type Command =
  | { type: 'CAST_SPELL';         cardId: ObjectId; targets?: Target[]; modePick?: Mode }
  | { type: 'ACTIVATE_ABILITY';   sourceId: ObjectId; abilityIndex: number; targets?: Target[] }
  | { type: 'PASS_PRIORITY' }
  | { type: 'MAKE_CHOICE';        payload: ChoicePayload }
  | { type: 'DECLARE_ATTACKERS';  attackers: ObjectId[] }
  | { type: 'DECLARE_BLOCKERS';   assignments: BlockerAssignment[] }
  | { type: 'PLAY_LAND';          cardId: ObjectId }
  | { type: 'CONCEDE' }
```

Commands carry intent only. No validation, no effect logic.

---

## 3. Rules Kernel — the machine

The kernel knows MTG structure but is blind to card text. It is responsible for:

**Turn structure management**
- Phase/step sequencing (untap, upkeep, draw, main, combat, end)
- Advancing steps when both players pass priority on an empty stack

**Priority distribution**
- Active player first, then non-active
- After any spell or ability resolves, active player gets priority again
- After each SBA + trigger loop, the active player gets priority

**State-based actions (SBA) loop**
```
loop:
  sbas = findAllApplicableSBAs(state)
  if sbas is empty → break
  state = applySBAs(state, sbas)  // all simultaneously
emit triggered abilities from SBA events
repeat until stable, then give priority
```

SBAs are pure predicates (creature with 0 toughness, player at 0 life, legend rule, etc.).

**Stack resolution**
- Pop top item
- If spell: run whiteboard resolution (see §5)
- If triggered/activated ability: run handler from Card Registry
- Emit resolution events
- Loop back to SBA check

**Combat**
- Declare attackers → check legality → SBA → priority
- Declare blockers → assignment → SBA → priority
- First/double strike → damage → SBA

---

## 4. Card Registry — data-driven card definitions

Each card is a `CardDefinition` object, not a class:

```typescript
type CardDefinition = {
  name: string
  manaCost: ManaCost
  typeLine: CardType[]
  subtypes: string[]
  color: Color[]

  // For creatures
  power?: number | '*'
  toughness?: number | '*'

  // Static intrinsic keywords
  keywords?: Keyword[]     // Flying, Islandwalk, etc.

  // Triggered abilities: fire when a GameEvent matches
  triggers?: TriggerDefinition[]

  // Activated abilities: player can activate
  activatedAbilities?: ActivatedAbilityDefinition[]

  // Spell effect: what happens when this resolves from the stack
  onResolve?: ResolveHandler

  // Static continuous effects while on battlefield
  continuousEffect?: ContinuousEffectDefinition

  // Replacement effects
  replacementEffect?: ReplacementEffectDefinition
}
```

Card definitions live in `packages/game-engine/src/cards/`. One file per card. No code inheritance.
The DSL is TypeScript itself — fully typed, IDE-navigable, testable in isolation.

---

## 5. Effect Resolution — the Whiteboard/Naps model

When a spell or ability resolves:

1. **Kernel creates an EffectContext** (the "whiteboard"):
   ```typescript
   type EffectContext = {
     source: ObjectId
     controller: PlayerId
     targets: ResolvedTarget[]
     pendingActions: Action[]      // kernel's planned work
     requiredChoice?: PendingChoice // set when onResolve needs player input
   }
   ```

2. **Card's `onResolve` handler fires**, reading/writing `pendingActions`:
   ```typescript
   onResolve(ctx: EffectContext, state: Readonly<GameState>, choices: ChoicePayload | null): EffectContext
   ```

3. **Replacement effects intercept** — cards with `replacementEffect` definitions scan
   `pendingActions` and substitute alternatives (e.g., "if a card would be put into a graveyard
   from anywhere, exile it instead").

4. **Kernel wakes, executes `pendingActions`**, emitting `GameEvent`s for each.

5. **Triggers scan events**, add triggered abilities to the stack with APNAP ordering.

This keeps `onResolve` handlers small and composable. The kernel never needs special cases for
replacement or redirection effects — they register themselves.

---

## 6. Layer System — continuous effects

Continuous effects that modify game objects are applied in the 7-layer order whenever the engine
needs the *current* view of an object:

| Layer | What it covers |
|-------|---------------|
| 1 | Copy effects |
| 2 | Control-changing effects |
| 3 | Text-changing effects (Mind Bend, Crystal Spray) |
| 4 | Type-changing effects (Dance of the Skywise: land → creature) |
| 5 | Color-changing effects |
| 6 | Ability-adding/removing |
| 7a | Power/toughness setting |
| 7b | P/T adjustments (counters, etc.) |
| 7c | Switching |

Implementation: `computeGameObject(objectId, state): DerivedGameObject` applies all live
`ContinuousEffect`s in layer order. The `objectPool` stores the "base" state; layers produce a
derived view used for legality checks, rendering, and SBA checks — never mutated directly.

Timestamp ordering is used within layers. In the full MTG rules, dependency detection (apply
effect A before B when B depends on A's result) can arise in any layer — not exclusively Layer 7.
The data structures must allow adding dependency detection to any layer without breaking changes.

In the initial implementation, explicit dependency resolution is only required for Layer 7, because
nothing in the current deck requires cross-effect dependency handling in other layers. The most
complex interactions in the current deck are text/type/control changing (Layers 2–6) with duration.

---

## 7. Trigger System — event-driven abilities

```typescript
type TriggerDefinition = {
  event: GameEventType | GameEventType[]
  condition?: (event: GameEvent, state: GameState) => boolean
  onTrigger: (event: GameEvent, state: GameState) => TriggerAction
}
```

After any batch of game events, the kernel:
1. Iterates all permanents on battlefield with triggers
2. Checks each `TriggerDefinition.event` and `.condition`
3. Collects matching triggers
4. Orders them by APNAP (active player's triggers first, then non-active player's)
5. Pushes them onto the stack as `TriggeredAbilityItem`s
6. Loops back through SBA

---

## 8. Choice System — blocking for player input

Some effects require player decisions mid-resolution (Brainstorm: "put 2 cards from your hand on
top"; Mystical Tutor: "search for an instant or sorcery"). These use:

```typescript
type PendingChoice = {
  type: 'CHOOSE_CARDS' | 'CHOOSE_TARGET' | 'CHOOSE_MODE' | 'CHOOSE_YES_NO' | ...
  forPlayer: PlayerId
  prompt: string
  constraints: ChoiceConstraints
  continuation: ContinuationToken  // opaque reference to resume resolution
}
```

When `processCommand` encounters a choice point, it returns:

```typescript
{ nextState: stateWithPendingChoice, newEvents: [], pendingChoice }
```

`pendingChoice` is stored in both `GameState.pendingChoice` (durable, survives reconnects) and
the `CommandResult` envelope (convenience for the server to react immediately without unpacking
state). The two must always agree; the engine is responsible for keeping them in sync.

The server broadcasts `pendingChoice` to the relevant player's client. The client submits a
`MAKE_CHOICE` command. The engine resumes from the `continuation` token.

**ContinuationToken design**: each spell's `onResolve` is a pure function that takes
`(ctx, state, choices | null)` and returns an `EffectContext`. When choices are needed, it returns
an `EffectContext` with `requiredChoice` set. The next call passes the fulfilled choice. This is a
lightweight resumable computation without coroutines.

---

## 9. Event System — immutable game record

Every mutation the kernel makes emits a `GameEvent`:

```typescript
// PlayerId is an alias for string (opaque nominal type in implementation)
type GameEvent =
  | { type: 'CARD_DRAWN';         playerId: PlayerId; cardId: ObjectId }
  | { type: 'PERMANENT_ENTERED';  objectId: ObjectId; zone: Zone }
  | { type: 'PERMANENT_LEFT';     objectId: ObjectId; zone: Zone; destination: Zone }
  | { type: 'SPELL_CAST';         objectId: ObjectId; controller: PlayerId }
  | { type: 'ABILITY_ACTIVATED';  sourceId: ObjectId; controller: PlayerId }
  | { type: 'SPELL_COUNTERED';    objectId: ObjectId }
  | { type: 'DAMAGE_DEALT';       sourceId: ObjectId; targetId: ObjectId; amount: number }
  | { type: 'LIFE_CHANGED';       playerId: PlayerId; amount: number; newTotal: number }
  | { type: 'PRIORITY_PASSED';    playerId: PlayerId }
  | { type: 'PHASE_CHANGED';      phase: Phase; step: Step }
  | { type: 'PLAYER_LOST';        playerId: PlayerId; reason: LossReason }
  | ...
```

Events are both:
- The **trigger feed** — triggers listen for specific event types
- The **persistence log** — stored in `game_events` table, enables replay

The server stores events in the database; the engine just returns them. Full game replay is
`events.reduce(applyEvent, initialState)`.

---

## 10. RNG and shuffle

`GameState.rngSeed` is the single source of truth for randomness. The engine constructs a
short-lived `Rng` instance from `state.rngSeed` at the start of each `processCommand` call,
runs any required Fisher-Yates shuffles or random operations using it, and writes the advanced
seed back into `nextState.rngSeed` before returning. Callers must not maintain a separate RNG
state outside `GameState`.

This makes the entire game deterministic given the initial seed — enabling full replay without
re-randomizing.

---

## Card-mechanism mapping

| Card(s) | Mechanism | Handled by |
|---------|-----------|------------|
| Memory Lapse | Counter + top-of-library put | `onResolve` + zone move action |
| Dandan | Islandwalk + "must attack" trigger | Layer 6 keyword + trigger definition |
| Accumulated Knowledge | Graveyard count | `onResolve` reads graveyard state |
| Diminishing Returns | Exile graveyard, shuffle, draw | Replacement effect + zone move |
| Brainstorm | Draw 3, put 2 back | Choice system (multi-card pick) |
| Mystical Tutor | Library search | Choice system (search) |
| Metamorphose | Counter + top-of-library + draw | Combo `onResolve` |
| Dance of the Skywise | Land → creature until EOT | Layer 4 continuous effect, duration |
| Crystal Spray | Text change | Layer 3 continuous effect |
| Mind Bend | Color/type word change | Layer 3 continuous effect |
| Memory Lapse + priority | Stack/counter interaction | Pure kernel (stack mechanics) |
| Mystic Sanctuary | ETB trigger, fetch Island | `TriggerDefinition` + `onResolve` |
| Halimar Depths | ETB trigger, top 3 arrange | `TriggerDefinition` + choice |
| Ray of Command | Gain control until EOT | Layer 2 duration-based effect |
| Predict | Name + mill + draw | `onResolve` + choice |

---

## Phased implementation order

### Phase 1 — Core skeleton (testable turn loop)
- GameState types (zones, objectPool, turnState)
- `processCommand` entry point
- Priority and pass-priority mechanics
- SBA: creature death, player life ≤ 0
- Cast spell → put on stack → resolve → zone move
- Mana payment (basic Island only)
- Draw, play land
- Island land card definition

### Phase 2 — Spells and targeting
- Target resolution + illegal target rule
- Creature spells enter battlefield
- Dandan + islandwalk (Layer 6)
- Memory Lapse (counter + library put)
- Accumulated Knowledge (graveyard count)

### Phase 3 — Combat
- Declare attackers/blockers
- Damage assignment
- First/double strike step
- Dandan "must attack if able" trigger

### Phase 4 — Complex effects
- Choice system (Brainstorm, Mystical Tutor, Halimar Depths, Predict)
- Layer 2 (Ray of Command control change)
- Layer 3 (Mind Bend, Crystal Spray text change)
- Layer 4 (Dance of the Skywise type change)
- Duration tracking (until end of turn effects)

### Phase 5 — Full deck completion
- Remaining card definitions
- Diminishing Returns, Mystic Retrieval, Supplant Form
- Full layer dependency resolution (if needed)

---

## File layout

```
packages/game-engine/src/
  state.ts                  # Expand: full GameState type
  command.ts                # New: Command union type
  event.ts                  # New: GameEvent union type
  engine.ts                 # New: processCommand entry point
  rules-kernel.ts           # New: turn structure, SBA, stack resolution, priority
  layers.ts                 # New: computeGameObject with 7-layer application
  triggers.ts               # New: trigger scanning and APNAP ordering
  choices.ts                # New: PendingChoice types and continuation model
  rng.ts                    # New: seeded deterministic RNG
  cards/
    index.ts                # Card registry (map from card name → CardDefinition)
    island.ts               # Reference implementation
    dandan.ts
    memory-lapse.ts
    ... (one file per unique card)
```

---

## Test strategy

| Scope | Approach |
|-------|----------|
| Unit | `processCommand` from a known state; assert `nextState` and `newEvents` match expected |
| Scenario | Multi-step game scripts (cast Memory Lapse on Memory Lapse; Dandan attacks into Dandan; Brainstorm into Diminishing Returns) |
| Invariants | Property tests checking SBA loop terminates, state remains consistent |
| Regression | One test per card definition exercising its `onResolve` / trigger / effect |

The engine is pure (no I/O), so all tests run without any mocks or database.
