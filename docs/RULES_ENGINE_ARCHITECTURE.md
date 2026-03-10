# Rules Engine Architecture

## Context

`packages/game-engine` now includes implemented Phase 0-2 foundations (deterministic state,
command processing, stack resolution, whiteboard/cursor, pending choices, and pipeline/replacement
handling). This document remains the full target architecture for the complete rules engine —
one that handles the complete Forgetful Fish card set with no dead-ends as the game expands,
while remaining tractable for a small TypeScript team.

The design synthesises lessons from XMage (authoritative server, continuous effects/layers,
replacement effect machinery, LKI/zone-change tracking), Forge (data-driven card scripting,
ETB lookahead via CR 614.12, replacement handler with apply-once semantics, static effects by
layer), MTG Arena (GRE/CLIPS two-level model, whiteboard/naps execution pattern), Argentum
(Kotlin MTG engine with immutable state, dependency resolution trial system), and SabberStone
(generated per-card tests, headless simulation runners).

---

## Why build our own engine

| Engine | Core barrier to wrapping |
|--------|------------------------|
| **XMage** | Java class-per-card ecosystem (~1M+ LOC); server-authoritative but tightly coupled to its Swing client and multi-module Java build |
| **Forge** | GPL-3.0 copyleft; global mutable `Game` root; network play is bandwidth-heavy and WIP; Java-only |
| **Cockatrice** | No rules enforcement — virtual tabletop only |
| **Magarena** | Single-player focus, Groovy scripts embedded in JVM |

All existing engines are Java/C#, tightly coupled to their UIs, and would require more effort
to wrap than to build a focused engine for our bounded scope (80-card blue deck, two-player,
shared library/graveyard).

## The key insight: MTG Arena's two-level model

MTG Arena (C++ + CLIPS) separates:

- **Game Rules Engine (GRE)** — knows MTG structure but is blind to individual cards: turn phases,
  priority, the stack, state-based actions, layers.
- **Effect System** — individual card rules as CLIPS rule objects that intercept the GRE's
  "task list" (the whiteboard).

The GRE writes a task ("destroy creatures A, B, C"), then "naps" while CLIPS rules modify the
whiteboard (remove indestructible creatures, exile unearthed ones instead), then the GRE wakes
and executes the result without ever knowing which rules fired.

Adapted to TypeScript this becomes a **Rules Kernel** plus a **Card Effect Registry**, with
card effects expressed as structured data (not opaque closures) so the layer system can
introspect and rewrite them.

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

### App-engine boundary contract (hardened)

The boundary is **API-level only**. `apps/server` and `apps/web` interact with the engine through
the package root exports, not engine internals.

| Layer | Owns | Must not own |
|------|------|---------------|
| **packages/game-engine** | Rules correctness, command validation, legal command generation, deterministic state transitions, event generation, serialization, view/event projection | Auth/session, room membership, transport fanout, database transactions |
| **apps/server** | AuthN/AuthZ, room lifecycle, command admission, persistence (`games`/`game_events`), event sequencing at transport boundary, reconnect/snapshot delivery | Card/rules logic, direct mutation of engine internals, rule-specific branching |
| **apps/web** | UI state/view rendering, command intent creation, reconnect UX, optimistic UX policy (if any) | Authoritative rule resolution, hidden-info redaction logic |

**Allowed crossings (server/app -> engine):**
- `createInitialGameState` (and future deck bootstrap constructor)
- `processCommand`
- `getLegalCommands`
- `serializeGameStateForPersistence` / `deserializeGameStateFromPersistence`
- `projectView` / `projectEvent` (when enabled in runtime path)
- engine domain types used for boundary payloads (`GameState`, `Command`, `GameEvent`, serialized state)

**Forbidden crossings:**
- Importing internal modules from `packages/game-engine/src/**` in apps (bypass of public contract)
- Server-side mutation of `state.zones`, `state.objectPool`, `state.turnState` outside engine constructors
- App-level rule forks (e.g., special-casing specific card behavior in server/web)

**Contract invariants:**
1. Every gameplay mutation path is `processCommand`-driven after initialization.
2. Engine outputs are authoritative: `nextState`, `newEvents`, optional `pendingChoice`.
3. Server persists engine outputs; it does not reinterpret rules semantics.
4. Client receives only projected/redacted data, never raw authoritative hidden information.

---

## 1. GameState — the complete snapshot

```
GameState
├── id, version, engineVersion
├── rngSeed
├── mode: GameMode                   // variant hooks (shared-deck, standard, etc.)
├── players[2]
│   ├── id, life, manaPool
│   ├── hand: ObjectId[]             // indices into objectPool
│   └── priority: boolean
├── zones
│   ├── library: ObjectId[]          // single shared library
│   ├── graveyard: ObjectId[]        // single shared graveyard
│   ├── battlefield: ObjectId[]
│   ├── exile: ObjectId[]
│   └── stack: ObjectId[]            // mirrors stack items for zone membership
├── objectPool: Map<ObjectId, GameObject>
│   └── GameObject: { id, zcc, cardDefId, owner, controller,
│                     counters, damage, tapped, summoningSick,
│                     attachments, abilities: AbilityAst[],
│                     zone: ZoneRef, ... }
├── stack: StackItem[]               // spells and abilities (execution data)
├── turnState
│   ├── activePlayerId
│   ├── phase, step
│   ├── priorityState: PriorityState
│   ├── attackers, blockers
│   └── landPlayedThisTurn
├── continuousEffects: ContinuousEffect[]
├── pendingChoice: PendingChoice | null  // persisted — survives reconnect/restart
├── lkiStore: Map<string, LKISnapshot>  // keyed by "objectId:zcc"
└── triggerQueue: TriggeredAbility[]    // waiting to be put on stack
```

Key design decisions:

- **objectPool** is a flat map by ID. Every zone holds IDs only. This avoids moving objects
  between typed arrays and enables the ECS pattern: attach/detach properties without changing
  object identity. Handles "a creature becomes a copy", "control change", and "Dandan gains
  flying" cleanly.
- **Shared library and graveyard** live in zones, not attached to a player. Ownership is tracked
  on `GameObject.owner`, not zone membership.
- **Object identity** uses `(id, zcc)` pairs. Every zone change bumps `zcc` on the moved object.
  All references in targets, triggers, and effects use `ObjectRef { id, zcc }` and are validated
  against current `zcc` — stale references fail gracefully (targets become illegal, triggers
  don't find their source, etc.).
- **LKI (Last-Known Information)** snapshots are stored when objects change zones. Keyed by
  `"objectId:zcc"`, they capture both base and derived state at the moment of departure. Used
  for "dies" triggers (checking characteristics of the creature that died) and target validation
  (spell targets the object as it was when targeted).
- **engineVersion** enables replay compatibility checking.

---

## 2. Object Identity and References

```typescript
type ObjectId = string;

interface ObjectRef {
  id: ObjectId;
  zcc: number;  // zone-change counter
}

interface LKISnapshot {
  ref: ObjectRef;
  zone: ZoneRef;
  base: GameObjectBase;       // base state at departure
  derived: GameObjectView;    // computed view at departure
}
```

Every zone change:
1. Snapshot current object as LKI (base + derived) keyed by `(id, currentZcc)`.
2. Increment `zcc` on the object.
3. Move object ID to new zone array.

**Why this matters for the deck:**
- `Memory Lapse` counters a spell and puts it on top of the library — the spell's identity
  changes zone (stack → library), so any lingering references to the old `(id, zcc)` correctly
  become stale.
- `Ray of Command` steals a creature temporarily — if the creature dies during the control
  change, its LKI preserves the controller/characteristics at death for trigger evaluation.
- Target validation for all instants/sorceries checks `(id, zcc)` against current state — if
  target changed zones since targeting, the spell fizzles.

---

## 3. Command — player intent

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

Commands carry intent only. Validation happens inside `processCommand`. Trigger ordering and
replacement-effect ordering are handled via `MAKE_CHOICE` with `PendingChoice.type` set to
`ORDER_TRIGGERS` or `CHOOSE_REPLACEMENT` respectively — they do not have dedicated command
types because the choice system already provides the mechanism for player decisions mid-flow.

---

## 4. Rules Kernel — the machine

The kernel knows MTG structure but is blind to card text. It is responsible for:

**Turn structure management**
- Phase/step sequencing (untap, upkeep, draw, main, combat, end)
- Advancing steps when both players pass priority on an empty stack

**Priority distribution**
- Active player first, then non-active
- After any spell or ability resolves, active player gets priority again
- After each SBA + trigger loop, the active player gets priority

**State-based actions (SBA) loop** (per CR 117.5)
```
loop:
  sbas = findAllApplicableSBAs(state)
  if sbas is empty AND triggerQueue is empty → break
  if sbas is not empty:
    state = applySBAs(state, sbas)  // all simultaneously
    emit events from SBA results
    continue loop
  if triggerQueue has entries:
    group by controller using APNAP
    for each player (APNAP order):
      if player has >1 trigger → emit PendingChoice for ordering
      else → put trigger(s) on stack
    continue loop
give priority to active player
```

This is a deterministic fixed-point loop. The only way to reach a priority checkpoint is
through this loop — card implementations cannot bypass SBAs or shortcut priority windows.

**Stack resolution**
- Pop top item
- Run through persisted EffectContext resolution (see §6)
- Emit resolution events
- Loop back to SBA check

**Combat**
- Declare attackers → check legality (including "must attack" from Dandan) → SBA → priority
- Declare blockers → assignment → SBA → priority
- First/double strike → damage → SBA

---

## 5. Card Registry — data-driven card definitions

Each card is a `CardDefinition` object, not a class:

```typescript
type CardDefinition = {
  id: string                   // stable reference (e.g., "dandan", "memory-lapse")
  name: string
  manaCost: ManaCost
  typeLine: CardType[]
  subtypes: SubtypeAtom[]      // structured, not raw strings — Layer 3 can rewrite
  color: ColorAtom[]           // structured atoms for Layer 5 rewriting
  supertypes?: Supertype[]

  // For creatures
  power?: number | '*'
  toughness?: number | '*'

  // Abilities as structured AST (not opaque closures)
  keywords?: KeywordAbilityAst[]
  staticAbilities?: StaticAbilityAst[]
  triggeredAbilities?: TriggerDefinitionAst[]
  activatedAbilities?: ActivatedAbilityAst[]

  // Spell effect: structured resolution steps
  onResolve?: ResolutionStep[]

  // Continuous effects while on battlefield
  continuousEffects?: ContinuousEffectDefinition[]

  // Replacement effects
  replacementEffects?: ReplacementEffectDefinition[]
}
```

Card definitions live in `packages/game-engine/src/cards/`. One file per card. No code
inheritance.

**Critical: abilities use structured AST, not closures.** This is required for Layer 3
(text-changing) to work correctly. See §8 for the ability AST model.

---

## 6. Effect Resolution — the Whiteboard/Naps model (with persisted context)

When a spell or ability resolves:

1. **Kernel creates (or resumes) an EffectContext** (the "whiteboard"):
   ```typescript
   type ResolutionCursor =
     | { kind: 'start' }
     | { kind: 'step'; index: number }           // which resolution step we're on
     | { kind: 'waiting_choice'; choiceId: string }
     | { kind: 'done' }

   type EffectContext = {
     stackItemId: StackItemId
     source: ObjectRef
     controller: PlayerId
     targets: ResolvedTarget[]
     cursor: ResolutionCursor
     whiteboard: Whiteboard
   }

   type Whiteboard = {
     actions: GameAction[]         // kernel's planned work
     scratch: Record<string, unknown>  // card-specific intermediate data
   }
   ```

2. **The EffectContext is persisted on the StackItem.** When a choice is needed mid-resolution,
   the context (including cursor position and all pending actions generated so far) is saved.
   When `MAKE_CHOICE` arrives, the kernel resumes from the saved cursor — it does NOT re-run
   earlier steps. This prevents double-application bugs and makes handlers trivially idempotent.

3. **Card's resolution steps fire** from the cursor position, reading/writing the whiteboard.

4. **Action Modifier Pipeline runs** on the whiteboard before execution (see §7).

5. **Kernel wakes, executes the modified whiteboard actions**, emitting `GameEvent`s for each.

6. **Triggers scan events**, add triggered abilities to the trigger queue.

**Why persisted context matters for this deck:**
- `Brainstorm`: Step 1 draws 3 cards, Step 2 asks player to choose 2 from hand, Step 3 puts
  them back on top of shared library in chosen order. With persisted context, Step 1's results
  are in the whiteboard; re-entry after the choice jumps directly to Step 3.
- `Predict`: Step 1 asks for a card name, Step 2 mills top 2, Step 3 checks if named card was
  milled and draws if so. Each step is an index in the cursor.
- `Halimar Depths`: ETB trigger resolves — look at top 3 of shared library, put them back in
  any order. Two choice points (which cards, what order).

---

## 7. Action Modifier Pipeline

The whiteboard's `actions` list represents *intended* game actions. Before the kernel executes
them, they pass through a 4-stage modifier pipeline:

| Stage | Purpose | Example |
|-------|---------|---------|
| **Rewrite** | Replacement effects substitute alternative actions | "If this would be put into a graveyard, exile it instead" |
| **Filter** | Cancel/erase actions that can't happen | Indestructible: "destroy" action removed; illegal targets: action removed |
| **Redirect** | Change action targets | Damage redirection effects |
| **Augment** | Add additional actions triggered by the pipeline | "Whenever a creature dies, draw a card" (rare; usually handled by triggers) |

```typescript
interface GameAction {
  id: ActionId
  type: ActionType            // DRAW, MOVE_ZONE, DEAL_DAMAGE, COUNTER, SET_CONTROL, etc.
  source: ObjectRef | null
  controller: PlayerId
  appliedReplacements: ReplacementId[]   // prevents re-application
  // ... type-specific fields
}
```

**Replacement effect apply-once semantics:**
- Each `GameAction` carries `appliedReplacements: ReplacementId[]`.
- When a replacement effect rewrites an action, its ID is appended to `appliedReplacements`.
- The rewrite stage re-evaluates after each replacement (the modified action may match new
  replacements) but skips any already in `appliedReplacements`.
- If multiple replacements apply, the affected object's controller (or the affected player)
  chooses which applies first.
- The loop terminates when no unapplied replacements match.

**Why this matters for the deck:**
- `Diminishing Returns` has "exile your graveyard" as part of resolution — this interacts with
  any replacement effects that care about cards going to exile.
- `Memory Lapse` uses `MOVE_ZONE` (stack → library top) which must go through the pipeline
  in case future cards add replacement effects on library placement.
- The filter stage handles target legality: if a spell's target left the battlefield between
  casting and resolution, the action is filtered out (spell fizzles if all targets illegal).

---

## 8. Ability AST — structured data for Layer 3 rewriting

Card abilities are represented as structured AST nodes, not opaque TypeScript closures. This
is **required** for Layer 3 (text-changing effects like Mind Bend and Crystal Spray) to work
correctly — the engine must be able to find and substitute text tokens at runtime.

```typescript
// Atomic tokens that Layer 3 can substitute
type BasicLandType = 'Plains' | 'Island' | 'Swamp' | 'Mountain' | 'Forest';
type Color = 'white' | 'blue' | 'black' | 'red' | 'green';

// Structured subtype atom (not a raw string)
type SubtypeAtom =
  | { kind: 'basic_land_type'; value: BasicLandType }
  | { kind: 'creature_type'; value: string }
  | { kind: 'other'; value: string }

type ColorAtom = { kind: 'color'; value: Color }

// Keyword abilities as structured data
type KeywordAbilityAst =
  | { kind: 'landwalk'; landType: BasicLandType }    // islandwalk on Dandan
  | { kind: 'flying' }
  | { kind: 'first_strike' }
  // ... extend as deck requires

// Static ability: restrictions/requirements
type StaticAbilityAst =
  | { kind: 'cant_attack_unless'; condition: AttackConditionAst }
  | { kind: 'when_no_islands_sacrifice'; landType: BasicLandType }  // Dandan's self-sac

type AttackConditionAst =
  | { kind: 'defender_controls_land_type'; landType: BasicLandType }

// Text change effect (Mind Bend / Crystal Spray)
type TextChangeEffect = {
  kind: 'text_change'
  fromLandType?: BasicLandType   // e.g., "Island" → "Swamp"
  toLandType?: BasicLandType
  fromColor?: Color
  toColor?: Color
  target: ObjectRef
  duration: Duration
}
```

**Layer 3 application:** `computeGameObject` walks the ability AST of each affected object and
substitutes matching atoms. For example, if Mind Bend changes "Island" to "Swamp" on a Dandan:
- `landwalk.landType` changes from `'Island'` to `'Swamp'` → creature now has swampwalk
- `when_no_islands_sacrifice.landType` changes from `'Island'` to `'Swamp'` → creature now
  sacrifices if defending player controls no Swamps
- `cant_attack_unless.defender_controls_land_type.landType` changes similarly

This is sound because the rewriting operates on data tokens, not on closure internals.

**Escape hatch:** For the rare card whose behavior genuinely can't be expressed as AST nodes,
a `{ kind: 'custom'; handler: string }` node can reference a named handler function in the
registry. But for this 80-card deck, AST coverage should be complete.

---

## 9. Layer System — continuous effects

Continuous effects that modify game objects are applied in the 7-layer order whenever the engine
needs the *current* view of an object:

| Layer | What it covers | Deck cards using it |
|-------|---------------|---------------------|
| 1 | Copy effects | Supplant Form (copy aspect) |
| 2 | Control-changing effects | Ray of Command |
| 3 | Text-changing effects | Mind Bend, Crystal Spray |
| 4 | Type-changing effects | Dance of the Skywise |
| 5 | Color-changing effects | Crystal Spray (if targeting color) |
| 6 | Ability-adding/removing | Dandan keywords, general grants |
| 7a | Power/toughness setting | Dance of the Skywise (sets P/T) |
| 7b | P/T adjustments (counters, +N/+N effects) | — |
| 7c | P/T switching | — |

### Implementation: `computeGameObject(objectId, state): DerivedGameObject`

Applies all live `ContinuousEffect`s in layer order. The `objectPool` stores the "base" state;
layers produce a derived view used for legality checks, rendering, and SBA checks — never
mutated directly.

### Ordering within layers: timestamp + dependency

**Timestamp ordering** is the default: effects are applied in timestamp order within each layer.
Timestamp is assigned when the effect begins (enters the battlefield, resolves, etc.).

**Dependency ordering** can override timestamp within any layer. Effect A depends on effect B if
applying B changes whether/how A applies. When dependencies exist:
1. Gather all effects in the current layer.
2. Build a dependency graph (A depends on B → B applies before A).
3. Topologically sort; break cycles with timestamp order per CR 613.8.
4. Apply in resolved order.

**Initial implementation scope:** Dependency resolution is implemented for **Layer 3** from the
start (required for Mind Bend / Crystal Spray interactions — one text change can alter the
tokens another text change is looking for). Data structures support dependency in all layers;
implementation expands as deck cards demand it.

```typescript
interface ContinuousEffect {
  id: string
  source: ObjectRef
  layer: Layer
  sublayer?: Sublayer
  timestamp: number
  duration: Duration
  appliesTo: EffectTarget          // which objects
  apply(view: GameObjectView): GameObjectView   // pure transform
  dependsOn?(other: ContinuousEffect, state: GameState): boolean  // for ordering
}

type Duration =
  | { kind: 'permanent' }
  | { kind: 'until_end_of_turn' }
  | { kind: 'while_source_on_battlefield' }
  | { kind: 'until_cleanup'; turnNumber: number }
  | { kind: 'as_long_as'; condition: ConditionAst }
```

### Caching strategy

Naive recomputation of all derived objects on every query is acceptable for the initial deck
size (~10-15 permanents typical). The data structures support future caching:
- Cache key: `(objectId, baseRevision, effectsListRevision)`
- Invalidation: bump `effectsListRevision` when any continuous effect is added/removed/expired
- Incremental: only recompute objects affected by the changed effect's `appliesTo`

---

## 10. Trigger System — event-driven abilities

```typescript
type TriggerDefinitionAst = {
  event: GameEventType | GameEventType[]
  condition?: ConditionAst           // structured, not a closure
  effect: ResolutionStep[]           // what happens when trigger resolves
  textTokens?: TextAtom[]           // for Layer 3 rewriting
}

type TriggeredAbility = {
  id: string
  source: ObjectRef
  controller: PlayerId
  triggerDef: TriggerDefinitionAst
  triggeringEvent: GameEvent        // the event that caused this trigger
  frozenValues?: Record<string, unknown>  // "intervening if" snapshot values
}
```

After any batch of game events, the kernel:
1. Iterates all permanents on battlefield with triggers (using derived/computed view)
2. Checks each trigger's event type and condition AST
3. Collects matching triggers into `triggerQueue`
4. Orders by APNAP (active player's triggers first, then non-active)
5. **Within each player's simultaneous triggers:** if >1, emit a `PendingChoice` for that
   player to order them. If only 1, no choice needed.
6. Pushes ordered triggers onto the stack as `TriggeredAbilityItem`s
7. Loops back through SBA

**Deck examples:**
- Mystic Sanctuary ETB + Halimar Depths ETB entering simultaneously under same controller →
  controller chooses which trigger goes on stack first (resolves last).
- Dandan's "when no Islands, sacrifice" is a state-triggered ability with `BasicLandType` token
  that Layer 3 can rewrite.

---

## 11. Choice System — blocking for player input (with persisted context)

```typescript
type PendingChoice = {
  id: ChoiceId
  type: 'CHOOSE_CARDS' | 'CHOOSE_TARGET' | 'CHOOSE_MODE' | 'CHOOSE_YES_NO'
      | 'ORDER_CARDS' | 'ORDER_TRIGGERS' | 'CHOOSE_REPLACEMENT' | 'NAME_CARD'
  forPlayer: PlayerId
  prompt: string
  constraints: ChoiceConstraints
}
```

`PendingChoice` contains only plain serializable data — no callbacks or function references. It
is safe to persist in `GameState` and round-trip through Postgres.

When `processCommand` encounters a choice point, it returns:
```typescript
{ nextState: stateWithPendingChoice, newEvents: [], pendingChoice }
```

`pendingChoice` lives in `GameState.pendingChoice` (durable — persisted to Postgres, survives
reconnects and server restarts). The `CommandResult` also carries `pendingChoice` as a
convenience field so the server can react immediately without unpacking state. The two always
agree; the engine sets both atomically.

**Re-entry model (persisted whiteboard):** The `EffectContext` (including `cursor`,
`whiteboard`, and `scratch`) is stored on the resolving `StackItem`. When a `MAKE_CHOICE`
command arrives:
1. Engine loads the `EffectContext` from the top-of-stack item.
2. Validates the choice payload against the `PendingChoice.constraints`.
3. Writes choice results into `whiteboard.scratch`.
4. Advances `cursor` to the next resolution step.
5. Continues resolution from the new cursor position.

No re-running of earlier steps. No closures. No coroutines. The context is the continuation.

**New choice types for this architecture:**
- `ORDER_TRIGGERS`: when a player has multiple simultaneous triggers.
- `CHOOSE_REPLACEMENT`: when multiple replacement effects apply to the same action and the
  affected player must choose which applies first.
- `NAME_CARD`: for Predict ("name a card").
- `ORDER_CARDS`: for Brainstorm ("put 2 cards back in what order"), Halimar Depths ("order top 3").

---

## 12. Event System — immutable game record

```typescript
type EventEnvelope = {
  engineVersion: string       // semver or git SHA for replay compatibility
  schemaVersion: number       // bump on breaking event format changes
  gameId: string
}

type GameEvent = GameEventBase & GameEventPayload

type GameEventBase = {
  id: string                  // stable unique ID
  seq: number                 // monotonic sequence number
}

type GameEventPayload =
  | { type: 'CARD_DRAWN';         playerId: PlayerId; cardId: ObjectId }
  | { type: 'ZONE_CHANGE';        objectId: ObjectId; oldZcc: number; newZcc: number;
                                   from: ZoneRef; to: ZoneRef; toIndex?: number }
  | { type: 'SPELL_CAST';         object: ObjectRef; controller: PlayerId }
  | { type: 'ABILITY_TRIGGERED';  source: ObjectRef; controller: PlayerId }
  | { type: 'ABILITY_ACTIVATED';  source: ObjectRef; controller: PlayerId }
  | { type: 'SPELL_RESOLVED';     object: ObjectRef }
  | { type: 'SPELL_COUNTERED';    object: ObjectRef }
  | { type: 'DAMAGE_DEALT';       source: ObjectRef; target: ObjectRef; amount: number }
  | { type: 'LIFE_CHANGED';       playerId: PlayerId; amount: number; newTotal: number }
  | { type: 'PRIORITY_PASSED';    playerId: PlayerId }
  | { type: 'PHASE_CHANGED';      phase: Phase; step: Step }
  | { type: 'PLAYER_LOST';        playerId: PlayerId; reason: LossReason }
  | { type: 'SHUFFLED';           zone: ZoneRef; resultOrder: ObjectId[] }
  | { type: 'CHOICE_MADE';        choiceId: ChoiceId; playerId: PlayerId;
                                   selection: ChoicePayload }
  | { type: 'RNG_CONSUMED';       purpose: string; result: number }
  | { type: 'CONTINUOUS_EFFECT_ADDED'; effectId: string; source: ObjectRef }
  | { type: 'CONTINUOUS_EFFECT_REMOVED'; effectId: string }
  | { type: 'CONTROL_CHANGED';    object: ObjectRef; from: PlayerId; to: PlayerId }
  // ... extend as needed
```

Events carry **facts, not intent**:
- `SHUFFLED` includes the resulting order (not just "a shuffle happened"), so replays don't
  depend on RNG seed determinism across engine versions.
- `RNG_CONSUMED` records each random draw explicitly.
- `CHOICE_MADE` records the actual selection.

This makes replay `events.reduce(applyEvent, initialState)` robust across engine code changes:
the event log is a self-contained record of what happened.

Events are both:
- The **trigger feed** — triggers listen for specific event types
- The **persistence log** — stored in `game_events` table
- The **replication stream** — sent to clients (after redaction)

---

## 13. Hidden Information and View Projection

The server holds full `GameState`. Clients never receive it directly. Instead, the server
projects per-player views:

```typescript
function projectView(state: GameState, forPlayer: PlayerId): GameView
function projectEvent(event: GameEvent, forPlayer: PlayerId): RedactedGameEvent
```

**What each player sees:**
- Their own hand contents ✓
- Opponent's hand count only (not contents)
- Shared library: count only (not order, not top card unless revealed)
- Shared graveyard: full contents (public zone)
- Battlefield: full contents (public zone)
- Exile: full contents of face-up exiled cards
- Stack: full contents (spells/abilities are public once cast)
- `rngSeed`: **never sent to clients**
- Pending choices: only if `forPlayer` matches `PendingChoice.forPlayer`

**Redacted events:**
- `CARD_DRAWN` for opponent → only shows "opponent drew a card" (no cardId)
- `SHUFFLED` → clients receive "library was shuffled" (no resultOrder)
- `ZONE_CHANGE` from library to hand → card identity hidden from opponent

**Reconnect support:** On reconnect, server sends `projectView(currentState, player)` as a
full snapshot. The client treats this as the canonical state and rebuilds its local view.

---

## 14. Game Mode — variant hooks

The shared-deck variant modifies how certain MTG concepts map to zones:

```typescript
interface GameMode {
  id: 'shared-deck'
  // "Your library" in rules text → which zone?
  resolveLibrary(state: GameState, player: PlayerId): ZoneRef
  // "Your graveyard" in rules text → which zone?
  resolveGraveyard(state: GameState, player: PlayerId): ZoneRef
  // Simultaneous draws from same effect: dealing order
  simultaneousDrawOrder(state: GameState, count: number, activePlayer: PlayerId): PlayerId[]
  // Ownership rules for cards drawn/played
  determineOwner(state: GameState, objectId: ObjectId, action: 'draw' | 'play'): PlayerId
}
```

**Why this matters:**
- `Memory Lapse` says "put it on top of its owner's library" — in shared-deck, the owner's
  library IS the shared library, but the variant rules must consistently resolve this.
- `Mystical Tutor` says "search your library" — routes to the shared library.
- `Diminishing Returns` says "each player exiles their hand and graveyard" — in shared-deck,
  the graveyard is shared; the mode hook determines how to handle "your graveyard."
- Simultaneous draws (e.g., "each player draws") are dealt alternately from the shared
  library, active player first, per variant rules.

The `GameMode` is injected into `GameState` so resolution logic can query it without hardcoding
variant assumptions into the kernel.

---

## 15. RNG and shuffle

`GameState.rngSeed` is the single source of truth for randomness. At the start of each
`processCommand` call, the caller constructs a short-lived `Rng` instance from `state.rngSeed`
(this is the `rng: Rng` parameter in the earlier signature — it must always be freshly derived
from `state.rngSeed`, never maintained externally). The engine runs any required Fisher-Yates
shuffles or random operations using it, and writes the advanced seed back into
`nextState.rngSeed` before returning. Callers must not evolve any RNG state outside `GameState`.

Every RNG consumption emits an `RNG_CONSUMED` event with the explicit result, and every shuffle
emits a `SHUFFLED` event with the resulting permutation. This makes the game deterministic given
the initial seed **and** makes replays independent of RNG implementation details.

---

## 16. ETB Lookahead — hypothetical state evaluation

Some cards require evaluating "what would this object look like if it were on the battlefield"
before it actually arrives (CR 614.12). This is needed for:
- Determining which replacement effects apply to an entering permanent
- Evaluating "as enters" abilities
- Computing ETB counters

```typescript
function previewEnterBattlefield(
  state: GameState,
  enteringObject: ObjectRef,
  destination: ZoneRef
): EnterPreview

type EnterPreview = {
  hypotheticalView: GameObjectView   // object as it would exist on battlefield
  applicableReplacements: ReplacementId[]
  applicableETBTriggers: TriggerDefinitionAst[]
}
```

**Implementation approach** (adapted from Forge's ReplacementHandler):
1. Create LKI copy of the entering object.
2. Simulate placing it on the battlefield (hypothetically).
3. Apply continuous effects from all current sources to compute derived view.
4. Use the derived view to determine applicable replacements and triggers.
5. If a replacement modifies the entering state, re-evaluate.

**Current deck scope:** Mystic Sanctuary has an ETB trigger conditioned on controlling 3+
Islands — the condition evaluation happens against actual battlefield state, not the preview.
Full CR 614.12 lookahead is needed only if a future card has "as this enters" replacement
semantics. The data structures support it; implementation can be deferred until a deck card
requires it.

---

## 17. Network Synchronization

The server replicates game state via **event stream**, not full-state broadcast:

1. Client sends `Command`.
2. Server runs `processCommand`, gets `CommandResult`.
3. Server persists events to `game_events` table.
4. Server sends each client: `projectEvent(event, playerId)` for each new event, plus
   optionally `projectView(nextState, playerId)` as a periodic snapshot.

**Reconnect protocol:**
1. Client reconnects and authenticates.
2. Server sends `projectView(currentState, playerId)` as full snapshot.
3. Client rebuilds local state from snapshot.
4. Normal event streaming resumes.

**Bandwidth:** events are small (JSON objects, typically <1KB each). A full game of ~200
actions produces ~50-100KB of event data total. No Forge-style "hundreds of megabytes" problem.

---

## Card-mechanism mapping

| Card(s) | Mechanism | Handled by |
|---------|-----------|------------|
| Memory Lapse | Counter + top-of-library put | `COUNTER` + `MOVE_ZONE` actions in whiteboard |
| Dandan | Islandwalk + "must attack" + "sac if no Islands" | Layer 6 keyword AST + static ability AST with `BasicLandType` token |
| Accumulated Knowledge | Graveyard count | Resolution step reads shared graveyard state |
| Diminishing Returns | Exile graveyard, shuffle, draw | Multiple whiteboard actions + `GameMode.resolveGraveyard` |
| Brainstorm | Draw 3, put 2 back | Multi-step resolution with persisted context + `ORDER_CARDS` choice |
| Mystical Tutor | Library search | `CHOOSE_CARDS` choice + `GameMode.resolveLibrary` |
| Metamorphose | Counter + top-of-library + draw | Multi-action whiteboard |
| Dance of the Skywise | Creature → 4/4 Dragon until EOT | Layer 4 type change + Layer 7a P/T set + duration |
| Crystal Spray | Text change one instance | Layer 3 `TextChangeEffect` on ability AST tokens |
| Mind Bend | Permanent text change | Layer 3 `TextChangeEffect` (permanent duration) on ability AST tokens |
| Mystic Sanctuary | ETB trigger, fetch instant/sorcery from graveyard | `TriggerDefinitionAst` + `CHOOSE_CARDS` + condition check |
| Halimar Depths | ETB trigger, top 3 arrange | `TriggerDefinitionAst` + `ORDER_CARDS` choice |
| Ray of Command | Gain control until EOT, untap, must attack | Layer 2 control change + `SET_CONTROL` action + duration |
| Predict | Name + mill + conditional draw | `NAME_CARD` choice + zone moves + condition check |
| Supplant Form | Bounce + create token copy | `MOVE_ZONE` + copy effect (Layer 1) |
| Unsubstantiate | Bounce spell or creature | `MOVE_ZONE` (battlefield/stack → hand) |
| Vision Charm | Modal: mill 4 / make artifact type / phase out | Mode choice + varied actions |
| Mystic Retrieval | Flashback, return instant/sorcery from graveyard | `CHOOSE_CARDS` + `MOVE_ZONE` + flashback cost alternative |
| Izzet Boilerworks | ETB bounce a land, tap for UR | ETB trigger + mana ability |
| Lonely Sandbar | Cycling | Activated ability (discard → draw) |
| Remote Isle | Cycling | Activated ability (discard → draw) |
| Svyelunite Temple | ETB tapped, sacrifice for UU | Static (enters tapped) + activated ability |
| Temple of Epiphany | ETB scry 1 | ETB trigger + `CHOOSE_CARDS` (top/bottom) |

---

## Phased implementation order

### Phase 0 — Foundations (determinism + identity + mode)
- Full `GameState` types with `ObjectRef(id, zcc)`, zone model, `GameMode` hooks
- Event envelope with `engineVersion` + `schemaVersion`
- Seeded deterministic RNG with explicit `RNG_CONSUMED` events
- `LKISnapshot` data structures (store on zone change)
- `processCommand` entry point (shell)
- Basic `GameAction` types
- Island land card definition (reference implementation)

### Phase 1 — Turn loop + priority + basic commands
- Priority engine with `PriorityState`
- Turn phase/step sequencing
- Draw, play land, pass priority commands
- Legal command generation (what can the active player do right now?)
- Minimal SBA loop (creature 0 toughness, player ≤0 life)
- Cast spell → put on stack → basic resolve → zone move
- Mana payment (basic Island + special lands)

### Phase 2 — Stack resolution + whiteboard + choices + action pipeline
- `EffectContext` with persisted `ResolutionCursor` and `Whiteboard`
- `PendingChoice` system with all choice types
- `MAKE_CHOICE` command handling (resume from cursor)
- Action Modifier Pipeline (rewrite/filter stages)
- Replacement effect registry with apply-once tracking
- Target validation with `ObjectRef(id, zcc)` staleness checks
- Fizzle rules (all targets illegal → spell doesn't resolve)
- Implement: Memory Lapse, Accumulated Knowledge, Brainstorm, Mystical Tutor, Predict

### Phase 3 — Continuous effects + layers (deck-critical)
- Layer system in `computeGameObject`
- Layer 2: control-changing (Ray of Command)
- Layer 3: text-changing with AST token substitution + dependency ordering (Mind Bend, Crystal Spray)
- Layer 4: type-changing (Dance of the Skywise)
- Layer 6: ability granting/removing
- Layer 7a-c: P/T modifications
- Duration tracking (until end of turn, while on battlefield, etc.)
- Implement: Dandan (full — keywords, restrictions, sac trigger), Ray of Command,
  Mind Bend, Crystal Spray, Dance of the Skywise

### Phase 4 — Combat + triggers + trigger ordering
- Declare attackers/blockers
- Damage assignment
- "Must attack if able" enforcement (Dandan)
- Trigger batching with APNAP + within-player ordering choice
- ETB triggers (Mystic Sanctuary, Halimar Depths, Temple of Epiphany, Izzet Boilerworks)
- State-triggered abilities (Dandan "when no Islands" sacrifice)
- LKI usage for "dies" / "leaves battlefield" triggers if needed

### Phase 5 — Full deck completion + complex cards
- Remaining card definitions: Diminishing Returns, Supplant Form, Metamorphose,
  Unsubstantiate, Vision Charm, Mystic Retrieval, cycling lands, Svyelunite Temple
- ETB lookahead (if any card requires CR 614.12 semantics)
- Layer 1 copy effects (Supplant Form token copy)
- Flashback (Mystic Retrieval)
- Full dependency resolution expansion (if interactions demand it)

### Phase 6 — View projection + networking + replay
- `projectView(state, playerId)` and `projectEvent(event, playerId)`
- Event-stream replication protocol
- Reconnect snapshot protocol
- Replay tooling with engine version compatibility checking
- Hidden information audit (verify no leaks of hand/library/RNG)

### Phase 7 — Testing hardening + polish
- Determinism test suite: same seed + same commands → identical event stream + state hash
- Per-card sanity tests: each card definition loads, casts, resolves without crash
- Scenario tests for complex interactions:
  - Brainstorm into Memory Lapse (draw 3, opponent counters your next spell, put back 2 on shared library)
  - Mind Bend on Dandan (change "Island" references to another land type)
  - Ray of Command stealing Dandan mid-combat
  - Crystal Spray + Mind Bend stacking (Layer 3 dependency ordering)
  - Predict naming a card that's on top of shared library
  - Diminishing Returns with shared graveyard
- Property-based tests: SBA loop termination, replacement effect loop termination,
  state consistency invariants
- Replacement/choice torture tests: nested replacement + choice ordering

---

## File layout

```
packages/game-engine/src/
  index.ts                       # Public API exports
  state/
    gameState.ts                 # Full GameState type
    objectRef.ts                 # ObjectRef, ObjectId, ZoneRef types
    gameObject.ts                # GameObject, GameObjectView types
    lki.ts                       # LKISnapshot type and helpers
    zones.ts                     # Zone types and zone-change logic
    priorityState.ts             # Priority tracking types
  commands/
    command.ts                   # Command union type
    validate.ts                  # Command validation
  events/
    event.ts                     # GameEvent union type + EventEnvelope
    eventBus.ts                  # Event emission and trigger scanning
  engine/
    processCommand.ts            # Entry point: processCommand
    kernel.ts                    # Turn structure, SBA, stack resolution, priority loop
    sba.ts                       # State-based action predicates
    combat.ts                    # Combat phases and damage
  stack/
    stackItem.ts                 # StackItem with EffectContext
    resolve.ts                   # Resolution with persisted whiteboard/cursor
  actions/
    action.ts                    # GameAction types
    pipeline.ts                  # Action Modifier Pipeline (rewrite/filter/redirect/augment)
    whiteboard.ts                # Whiteboard type and helpers
  effects/
    continuous/
      layers.ts                  # computeGameObject, layer application
      dependency.ts              # Dependency graph + toposort within layers
      duration.ts                # Duration tracking and cleanup
      textChange.ts              # Layer 3: text token substitution
      controlChange.ts           # Layer 2
      typeChange.ts              # Layer 4
      abilityChange.ts           # Layer 6
      ptChange.ts                # Layer 7
    replacement/
      registry.ts                # Replacement effect registration
      applyOnce.ts               # Apply-once tracking
      etbLookahead.ts            # CR 614.12 hypothetical evaluation
  triggers/
    trigger.ts                   # TriggerDefinitionAst, TriggeredAbility types
    batch.ts                     # Trigger batching, APNAP + intra-player ordering
  choices/
    pendingChoice.ts             # PendingChoice types
    resume.ts                    # Choice resumption from persisted context
  cards/
    abilityAst.ts                # Ability AST node types
    cardDefinition.ts            # CardDefinition type
    index.ts                     # Card registry (map from card ID → CardDefinition)
    island.ts                    # Reference implementation
    dandan.ts
    memory-lapse.ts
    brainstorm.ts
    mind-bend.ts
    crystal-spray.ts
    ray-of-command.ts
    ... (one file per unique card)
  mode/
    gameMode.ts                  # GameMode interface
    sharedDeck.ts                # Shared-deck variant implementation
  view/
    projection.ts                # projectView, projectEvent
    redaction.ts                 # Event redaction rules
  rng/
    rng.ts                       # Seeded deterministic RNG
```

---

## Test strategy

| Scope | Approach |
|-------|----------|
| **Unit** | `processCommand` from a known state; assert `nextState` and `newEvents` match expected |
| **Card sanity** | Generated test per card: load definition, cast in harness, resolve, assert no crash + expected zone changes |
| **Scenario** | Multi-step game scripts (cast Memory Lapse on Memory Lapse; Dandan attacks into Dandan; Brainstorm into Diminishing Returns; Mind Bend on Dandan; Ray of Command mid-combat) |
| **Invariants** | Property tests: SBA loop terminates, replacement loop terminates, state is consistent (all objectIds in zones exist in pool, all pool objects have valid zones, no stale ObjectRefs in active effects) |
| **Determinism** | Same initial seed + same command sequence → byte-identical event stream and state hash |
| **Replacement torture** | Property tests with nested replacement + choice ordering scenarios |
| **Layer ordering** | Targeted tests for Layer 3 dependency (Mind Bend + Crystal Spray on same permanent) |
| **Hidden info** | Verify `projectView` never leaks opponent hand, library order, or RNG seed |
| **Regression** | One test per fixed bug, preserved forever |

The engine is pure (no I/O), so all tests run without any mocks or database.

### Boundary test ownership matrix

| Test surface | Owner | Primary assertions |
|-------------|-------|--------------------|
| **Engine unit/integration/property/determinism** | `packages/game-engine/test/**` | Rule correctness, event ordering, invariants, replay/determinism, hidden-info projection correctness |
| **Server app tests** | `apps/server/test/**` | Auth, room permissions/lifecycle, command admission flow, persistence shape/versioning, websocket/http contracts |
| **Cross-boundary contract tests** | `apps/server/test/**` + focused engine fixtures | Server uses engine public API only; persisted event/state schema compatibility; command -> processCommand -> persistence pipeline consistency |

**Boundary-hardening expectations for tests:**
- App tests treat engine as a black box API (no internal imports, no direct state mutation hacks).
- Engine tests may build deterministic fixtures, but scenario/integration tests should prefer
  command-driven flows over direct field mutation.
- Any bug fixed at the boundary gets:
  1) an engine regression test (rules-side), and
  2) an app contract test if persistence/transport behavior was involved.

---

## Appendix: Key deck interactions to test

These are the most complex interactions in the 80-card deck that exercise multiple subsystems:

1. **Mind Bend on Dandan** — Layer 3 rewrites all `BasicLandType` tokens on Dandan's abilities.
   Dandan's islandwalk, "can't attack unless defender controls [land]", and "sacrifice when no
   [land]" all change behavior. Tests: creature gains different landwalk; sacrifice trigger
   checks new land type; attack restriction checks new land type.

2. **Crystal Spray + Mind Bend on same permanent** — Two Layer 3 effects with potential
   dependency. Tests: ordering matters; dependency resolution picks correct order; timestamp
   fallback for independent effects.

3. **Brainstorm with shared library** — Draw 3 from shared library, put 2 back on top of shared
   library in chosen order. Tests: persisted resolution context across choice; correct cards
   available; library order after put-back; opponent doesn't see cards drawn.

4. **Ray of Command stealing Dandan mid-combat** — Layer 2 control change + untap + "must
   attack" interaction. Tests: stolen creature untaps; attack requirements update; control
   reverts at end of turn; creature returns to original controller if still on battlefield.

5. **Memory Lapse on opponent's spell** — Counter + put on top of shared library. Tests: spell
   leaves stack; goes to top of shared library (not a player's library); opponent draws it next.

6. **Predict naming a card in shared library** — Name a card, mill top 2 of shared library, if
   named card was milled draw 2. Tests: naming choice persisted; mill goes to shared graveyard;
   condition check against milled cards; draw from shared library.

7. **Supplant Form on Dandan** — Bounce creature + create token copy. Tests: Layer 1 copy
   applies; token has all characteristics of copied Dandan; original returns to hand.

8. **Diminishing Returns with shared graveyard** — Each player exiles hand and graveyard, then
   shuffles library and draws 7. Tests: shared graveyard exiled correctly; shared library
   shuffled; draws alternate per variant rules; `GameMode` hooks used correctly.
