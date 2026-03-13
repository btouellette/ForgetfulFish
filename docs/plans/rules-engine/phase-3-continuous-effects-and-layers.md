# Rules Engine Implementation: Phase 3 — Continuous effects + layers

Status: in progress

### [x] P3.1 — ContinuousEffect type and registry

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
