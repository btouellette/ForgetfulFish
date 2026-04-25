# Rules Engine Implementation: Phase 3 — Continuous effects + layers

Status: in progress

## Phase 3 execution plan updates

### Resolve-spec composition refactor plan

**Goal**: replace the current monolithic `ResolveEffectSpec` growth pattern with a small composable primitive set while preserving the existing pause/resume and action-pipeline model.

**Current pain points confirmed in code**
- `packages/game-engine/src/cards/resolveEffect.ts` is the monolithic discriminated union for `onResolve` specs.
- `packages/game-engine/src/stack/effects/handlers.ts` contains the matching monolithic interpreter switch, so every new card pattern currently grows both the type surface and the runtime branching surface.
- `packages/game-engine/src/cards/*.ts` accumulates card-specific spec objects directly, which encourages adding a new top-level variant whenever a card does not fit an existing shape.
- `packages/game-engine/src/view/projection.ts` and `apps/web/lib/auto-tapper.ts` currently read specific effect IDs, so refactoring the spec model also needs a capability/query migration plan.

**Composition model to target**
- Keep `CardDefinition.onResolve` as an ordered list, but let each entry be a primitive or composite sequence instead of only a monolithic variant.
- Reuse existing `GameAction` atoms as the runtime foundation: `DRAW`, `MOVE_ZONE`, `SHUFFLE`, `COUNTER`, `SET_CONTROL`, `UNTAP`, `ADD_CONTINUOUS_EFFECT`, and related pipeline-ready actions.
- Reuse the existing step/pause helpers in `stack/effects/primitives.ts` for multi-step resolution so choices, resume checkpoints, and whiteboard scratch state stay compatible with `stack/resolve.ts`.
- Introduce a small canonical primitive set for Phase 3 planning purposes: `draw`, `move_zone`, `shuffle`, `search_library`, `name_card`, `mill`, `counter`, `set_control`, `untap`, `add_continuous_effect`, `choose_cards`, `order_cards`, `conditional`, and `sequence`.

**Execution order**
1. Add primitive spec types and a primitive interpreter without changing card definitions yet.
2. Convert the effect registry/query layer so projection/UI ask semantic capability questions instead of matching raw effect IDs.
3. Convert card files from monolithic variants to primitive sequences, starting with heavily tested cards.
4. Remove the old monolithic variant path as soon as the primitive interpreter and card updates are in place.

**Files expected to change during implementation**
- `cards/resolveEffect.ts`
- `cards/cardDefinition.ts`
- `cards/*.ts` (incremental migration)
- `stack/effects/handlers.ts`
- `stack/effects/primitives.ts`
- `stack/effects/types.ts`
- `stack/resolve.ts`
- `stack/onResolveRegistry.ts`
- `view/projection.ts`
- `apps/web/lib/auto-tapper.ts`
- `test/stack/**`, `test/cards/**`

**Compatibility and verification requirements**
- Preserve the current pause/resume contract in `EffectContext.whiteboard.scratch`; primitive execution must not regress interrupted resolution flows.
- Preserve the action pipeline contract; primitive interpretation must still emit normal `GameAction`s so replacement/pipeline handling remains centralized.
- Add parity tests proving each current monolithic variant produces the same action flow and choice pauses after being expressed through primitives.
- Treat raw effect-ID queries as technical debt to remove as part of this refactor; replace them with capability queries before deleting the old variant path.
- Add explicit parity tests for emitted `GameAction` ordering and effect visibility timing so primitive execution remains identical to the current interpreter from the pipeline/trigger system's perspective.
- Call out cross-object dependency handling up front: if a text/ability effect on object A changes applicability or output for object B, dependency evaluation rules must stay deterministic and be covered by dedicated tests before broad card conversion.
- Because there are no live users or in-progress games to preserve, Phase 3 should use a pure cutover: convert all relevant cards/consumers to primitives, then delete the old monolithic path rather than introducing any adapter layer.

### Haste + summoning-sickness architecture plan

**Goal**: make haste a real keyword in the computed object view and make summoning-sickness legality depend on keyword presence, so granted haste and native haste share one rules path.

**Current pain points confirmed in code**
- `packages/game-engine/src/effects/continuous/layers.ts` currently special-cases `grant_haste` by directly setting `summoningSick: false` in the derived view.
- `packages/game-engine/src/stack/effects/handlers.ts` creates that special-case continuous effect for the current Ray of Command path.
- `packages/game-engine/src/cards/abilityAst.ts` supports several keywords but does not currently include `haste`.
- `CardDefinition.keywords` exists, but native card-definition keywords are not yet being injected into the runtime computed view in a way that lets haste naturally affect combat legality.
- Newly entered permanents do not appear to have one centralized, reliable place where `summoningSick: true` is assigned on battlefield entry, which will matter once haste becomes the single source of truth for bypassing that restriction.

**Architecture to target**
- Add `haste` to the keyword AST so it is representable in both native card definitions and granted continuous effects.
- Ensure the initial computed object view includes inherent card-definition keywords before continuous-effect application finishes.
- Make Layer 6 ability handling operate on keyword presence rather than on a one-off `grant_haste` branch.
- Keep attack legality keyed off the computed object view, so `canObjectAttack` naturally respects either printed or granted haste.
- Centralize battlefield-entry handling so permanents enter with `summoningSick: true` when rules require it, and haste then clears the restriction through normal derived-view computation.

**Execution order**
1. Extend the keyword AST and related card-definition/runtime typing to include `haste`.
2. Ensure `computeGameObject` starts from a base/derived view that includes native card-definition keywords.
3. Generalize Layer 6 ability-grant handling so haste is represented as a keyword grant rather than only as a hard-coded summoning-sickness toggle.
4. Update the current grant-haste producer sites to use the keyword-driven path.
5. Audit battlefield-entry flows so creatures consistently acquire base summoning sickness on entry before derived-view keyword logic is applied.
6. Add regression tests covering both native haste and temporarily granted haste using the same combat-legality path.

**Files expected to change during implementation**
- `cards/abilityAst.ts`
- `cards/cardDefinition.ts`
- `effects/continuous/layers.ts`
- `stack/effects/handlers.ts`
- `commands/validate.ts` (verification coverage even if behavior stays unchanged)
- `actions/executor.ts`
- `stack/resolve.ts`
- `state/gameObject.ts`
- `test/effects/continuous/**`, `test/cards/**`, `test/engine/combat*.test.ts`

**Compatibility and verification requirements**
- Keep combat legality sourced from the computed view rather than adding parallel haste checks in combat validation.
- Add regression coverage for native-haste creatures, temporary haste grants, and re-entry/battlefield-entry cases that should still be summoning sick without haste.
- Do not leave both models half-active; the implementation should converge on keyword presence as the reason a creature can ignore summoning sickness.
- Update any keyword serialization/fixture/schema surfaces alongside `KeywordAbilityAst` so adding `haste` does not break card loading, persisted fixtures, or replay data.
- Include token creation, blink/re-entry, and other battlefield-entry paths in the summoning-sickness audit so the new single-source-of-truth model does not remain correct only for cast spells.
- Because old game-state compatibility is explicitly out of scope right now, prefer the simpler architecture over temporary compatibility layers when changing haste/keyword representations.

### Cross-cutting implementation notes

- The resolve-spec refactor and the haste refactor should land in that order: primitive `add_continuous_effect` / ability-grant composition makes the haste cleanup less bespoke.
- Preserve TDD sequencing throughout: each migration slice should add failing parity/regression tests before interpreter or layer changes.
- Record the final primitive-spec model and the keyword-driven haste decision in `docs/decisions/decision-log.md` once implementation is approved and starts changing behavior/architecture.
- Since no production users or in-flight games need protection yet, implementation may update engine, projection, and UI consumers together and remove obsolete code paths immediately once replacements are in place.
- Keep an eye on `computeGameObject` recomputation cost while widening Layer 6/keyword usage; if Phase 3 work noticeably increases call frequency or repeated scans, capture that in acceptance notes before Phase 3 is closed.
- Do not add a temporary compile/bridge layer for resolve specs; Phase 3 should cut directly from the monolithic variant model to the primitive model.

### Concrete execution slices

#### [x] Slice A — Define primitive resolve-spec model and cut the interpreter over

**Goal**: replace the monolithic `ResolveEffectSpec` union and handler switch with a primitive/composite spec model that can express the currently implemented cards without an adapter layer.

**Files**
- `cards/resolveEffect.ts`
- `stack/effects/handlers.ts`
- `stack/effects/primitives.ts`
- `stack/effects/types.ts`
- `stack/resolve.ts`
- `test/stack/**`

**Tests first**
- Add or update stack/effect tests that prove the primitive interpreter preserves current pause/resume behavior for:
  - Brainstorm-style draw/choose/order/return flows
  - Mystical Tutor-style search/shuffle/top flows
  - Predict-style name/mill/draw flows
  - Memory Lapse-style counter-to-library flows
  - Ray of Command-style multi-action resolution flows
- Add explicit assertions for emitted `GameAction` ordering and the exact `pendingChoice` sequence.

**Implementation steps**
1. Replace the current top-level discriminated union with a primitive/composite spec vocabulary.
2. Convert `handlers.ts` from per-card-shape resolution helpers to primitive interpreters built around the existing step/pause utilities.
3. Keep `stack/resolve.ts` responsible for orchestration only; do not let card-specific branching leak back into it.
4. Delete the old monolithic variant-only execution path in the same slice once the new interpreter is active.

**Acceptance**
- No old monolithic `ResolveEffectSpec` variants remain in runtime handling.
- Existing Phase 2/3 card resolution tests pass through the primitive interpreter.

#### [x] Slice B — Convert shipped card definitions and effect-ID consumers

**Goal**: move card definitions and consumer queries to the new primitive/capability model so no code still depends on monolithic resolve-spec IDs.

**Files**
- `cards/*.ts`
- `stack/onResolveRegistry.ts`
- `view/projection.ts`
- `apps/web/lib/auto-tapper.ts`
- `test/cards/**`
- `test/view/**`

**Tests first**
- Add/update tests proving card definitions still resolve correctly after conversion to primitive sequences.
- Add/update tests proving projection/UI helpers query semantic capabilities instead of raw effect IDs.

**Implementation steps**
1. Convert all currently shipped `onResolve` card definitions to primitive sequences.
2. Replace raw effect-ID checks with capability-style queries derived from the new primitive model.
3. Remove now-dead ID-specific helper logic once all consumers are updated.

**Acceptance**
- No active card definition still uses the old monolithic resolve-spec shape.
- Projection and UI helpers no longer branch on raw effect IDs.

#### [x] Slice C — Add real haste keyword support to the rules model

**Goal**: make haste representable as a first-class keyword and prepare the derived view to include native keyword data.

**Files**
- `cards/abilityAst.ts`
- `cards/cardDefinition.ts`
- `state/gameObject.ts`
- `effects/continuous/layers.ts`
- `test/effects/continuous/**`

**Tests first**
- Add/update tests proving native keywords are present in the computed view.
- Add/update tests proving granted keyword abilities can be represented without bespoke `grant_haste`-only logic.

**Implementation steps**
1. Extend `KeywordAbilityAst` with `haste`.
2. Ensure the computed/base object view includes card-definition keywords before continuous effects are applied.
3. Generalize Layer 6 ability application so keyword grants flow through one path.

**Acceptance**
- `haste` exists as a normal keyword in the AST/type system.
- Native keyword presence is visible in computed object views.

#### [x] Slice D — Make summoning sickness derive from keyword presence

**Goal**: remove the special-case haste toggle and make combat legality depend on the computed keyword-driven view.

**Files**
- `effects/continuous/layers.ts`
- `stack/effects/handlers.ts`
- `commands/validate.ts`
- `actions/executor.ts`
- `stack/resolve.ts`
- `test/effects/continuous/**`
- `test/engine/combat*.test.ts`
- `test/cards/rayOfCommand.test.ts`

**Tests first**
- Add/update tests proving creatures with native haste can attack despite entering this turn.
- Add/update tests proving temporarily granted haste uses the same legality path.
- Add/update tests proving creatures without haste remain summoning sick after battlefield entry across cast, token, and re-entry paths.

**Implementation steps**
1. Replace the `grant_haste` special-case in `layers.ts` with keyword-based logic.
2. Update haste-grant producer sites to grant the keyword rather than directly clearing summoning sickness.
3. Audit battlefield-entry code paths so creatures consistently enter with base summoning sickness when required.
4. Keep `commands/validate.ts` reading only the computed object view for attack legality.

**Acceptance**
- No runtime path directly uses a haste-only summoning-sickness toggle.
- Native and granted haste both work through the same computed-view legality path.

#### [x] Slice E — Cleanup, verify, and document final architecture

**Goal**: leave Phase 3 in the clean post-cutover state with no temporary dual systems.

**Files**
- all touched source/test files
- `docs/decisions/decision-log.md`

**Verification**
- `lsp_diagnostics` clean on all changed files.
- Relevant game-engine tests pass.
- No dead monolithic resolve-spec paths remain.
- No dead haste-specific compatibility branches remain.

**Acceptance**
- The engine uses only primitive resolve specs and keyword-driven haste behavior.
- The decision log records the new canonical architecture.

**Closure notes**
- Verified there are no remaining monolithic resolve-spec IDs in the codebase.
- Verified there are no remaining `grant_haste` compatibility paths in the codebase.
- Recorded the final primitive resolve-spec and keyword-driven haste architecture in `docs/decisions/decision-log.md`.

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

### [x] P3.2 — computeGameObject (layer application engine)

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

**Closure notes**
- `effects/continuous/layers.ts` now implements the full `computeGameObject` path around a shared `resolveContinuousEffects` helper: it starts from the base object/card-definition view, gathers applicable continuous effects, orders them by layer and dependency, applies them in sequence, and returns the derived `GameObjectView`.
- `test/effects/continuous/compute.test.ts` covers the task’s acceptance surface and beyond, including base-view identity, Layer 7a power/toughness setting, same-layer timestamp ordering, dependency overrides, conditioned effects, deterministic cycle fallback, and applied-effect ordering via `getApplicableContinuousEffects`.
- Later Phase 3 slices now exercise the same engine path across Layer 2, Layer 3, Layer 4, Layer 6, and Layer 7 behavior, so `computeGameObject` is no longer just groundwork; it is the active shared derivation engine for the shipped continuous-effect system.

### [x] P3.3 — Duration tracking and cleanup

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

**Current status / intended next direction**
- `cleanupExpiredEffects` now exists as a dedicated helper and handles the `until_end_of_turn` case with `CONTINUOUS_EFFECT_REMOVED` event emission, wired through the cleanup step.
- `while_source_on_battlefield` effects now also expire when their source leaves the battlefield or changes identity, wired through the SBA loop so battlefield departures clean up source-bound effects in the same convergence pass.
- `until_cleanup` effects now expire during the cleanup step via the same duration helper path used for other removal events, so cleanup-step expiration no longer relies on inline turn logic.
- `as_long_as` effects now expire through the shared duration helper path as soon as their condition stops holding, both during cleanup-step processing and during SBA-loop convergence after battlefield changes.

### [x] P3.4 — Layer 2: control-changing effects

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

**Current status / intended next direction**
- Layer 2 control changes already ship through the shared continuous-effect engine: `SET_CONTROL` creates `set_controller` effects, `computeGameObject` applies them in timestamp order, cleanup removes `until_end_of_turn` control changes, and derived activated-ability legality respects the current controller.
- Dedicated Layer 2 unit coverage now exists alongside the existing Ray of Command integration tests, so the remaining unchecked Phase 3 work can move on to the next real engine gaps rather than revisiting control-change foundations.

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

**Current status / intended next direction**
- Layer 3 now infers per-object dependency ordering for text-change effects when one rewrite makes another effect newly applicable, reusing the existing topological sort and timestamp cycle fallback in the shared continuous-effect engine.
- The remaining P3.5 work is still open: `Color` token substitution is not implemented yet, so the next text-change slice should cover color-word rewriting and any card-level coverage that depends on it.

### [x] P3.6 — Layer 4: type-changing effects

**Files**: `effects/continuous/layers.ts`

Cards: **Dance of the Skywise**

Implement:
- Type change continuous effect:
  - Layer 4 application: changes `typeLine`, `subtypes` on GameObjectView
  - Dance of the Skywise: target creature becomes Dragon base type with new types
- Interacts with Layer 7a (P/T set) for Dance of the Skywise's "4/4" component

**Test file**: `test/effects/continuous/type.test.ts`
Depends: P3.1, P3.2
Test: **Write tests FIRST**, then implement.
1. Dance of the Skywise on a creature preserves the creature card type while replacing its subtypes with `Dragon` (and any other effect-defined creature subtypes).
2. Existing creature subtypes are replaced by the effect-defined creature subtype set, such as `Dragon` (unless specified otherwise).
3. The effect correctly expires at the end of the turn.
4. Type change application occurs before Layer 6 and Layer 7.
5. Multiple type changes combine or overwrite based on timestamp.
6. `computeGameObject` reflects the updated type/subtype view in the derived object.
Acceptance: Type changing works for Layer 4 subtype replacement and combines correctly with P/T setting for Dance.

**Closure notes**
- `computeGameObject` now applies Layer 4 `type_change` effects to the derived view while preserving noncreature card types and replacing subtypes from the effect payload.
- Dedicated Layer 4 coverage exists in `test/effects/continuous/type.test.ts`, including timestamp ordering, explicit dependency ordering, and sequencing ahead of later-layer ability grants.
- `Dance of the Skywise` also verifies the end-to-end Layer 4 path in `test/cards/danceOfTheSkywise.test.ts`, including cleanup expiration and interaction with Layer 7a/7b power-toughness handling.

### [x] P3.7 — Layer 6: ability adding/removing

**Files**: `effects/continuous/layers.ts`

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

**Closure notes**
- Layer 6 ability handling now lives in `effects/continuous/layers.ts`, where `computeGameObject` starts from card-definition keywords/static abilities and then applies `grant_keyword` and `remove_all_abilities` continuous effects in layer order.
- Dedicated Layer 6 coverage now exists in `test/effects/continuous/ability.test.ts`, covering Dandan's native islandwalk, ability removal, multiple keyword grants, post-text/post-type sequencing, conditional grants, and invariant checks.
- Existing card/integration coverage in `test/cards/dandan.test.ts` and `test/cards/danceOfTheSkywise.test.ts` continues to exercise the shipped Layer 6 behavior from both native and temporary effect sources.

### [x] P3.8 — Layer 7: P/T modifications

**Files**: `effects/continuous/layers.ts`

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

**Current status / intended next direction**
- Layer 7a `set_pt` effects already apply through `computeGameObject`, and Layer 7b now also adjusts derived power/toughness for `+1/+1` and `-1/-1` counters on the computed view.

**Closure notes**
- `computeGameObject` now supports the full Layer 7 sublayer sequence in the shared continuous-effect engine: `set_pt` in 7a, generalized `adjust_pt` effects plus synthetic counter adjustments in 7b, and `switch_pt` effects in 7c.
- Dedicated Layer 7 coverage now lives in `test/effects/continuous/pt.test.ts`, covering exact P/T setting, generalized adjustments, sublayer sequencing, switching, cumulative adjustments, and negative-value results.
- Existing `compute.test.ts` and `danceOfTheSkywise.test.ts` coverage continues to verify the shipped card-facing 7a/7b paths alongside the new dedicated unit coverage for the remaining 7b/7c engine behavior.

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

### [x] P3.10 — Card: Ray of Command

**Files**: `cards/ray-of-command.ts`

Cards: **Ray of Command** (gain control of creature until EOT, untap it, it must attack)

Implement:
- CardDefinition: instant, {3}{U}, `onResolve`:
  - Step 0: `SET_CONTROL` action (target creature → controller becomes caster)
  - Step 1: `UNTAP` action on the creature
  - Step 2: Add continuous effects: grant haste and "must attack this turn" (duration: until_end_of_turn)
- Creates Layer 2 continuous effect for control change

**Test file**: `test/cards/rayOfCommand.test.ts`
Depends: P0.11, P2.1, P3.4
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as 4-mana blue instant.
2. (Casting) Targets a creature controlled by any player.
3. (Resolution) Caster gains control of the creature until end of turn.
4. (Resolution) The targeted creature becomes untapped.
5. (Resolution) The targeted creature gains haste and a "must attack" continuous effect.
6. (Shared-deck) Control change works for permanents owned by the shared deck.
7. (Interaction) The creature reverts to its previous controller at the cleanup step.
8. (State) `assertStateInvariants` holds throughout control duration.
Acceptance: Control change + untap resolve correctly, duration tracked.

**Closure notes**
- `cards/ray-of-command.ts` now resolves through the shared primitive effect pipeline: it sets control until end of turn, untaps the target, grants haste, and adds the until-end-of-turn `must_attack` effect on the same object.
- `test/cards/rayOfCommand.test.ts` covers the listed acceptance surface, including definition/casting, derived control, untap, required-attack enforcement, shared-deck ownership, cleanup-step reversion, and invariant preservation.
- Supporting continuous-effect behavior is covered across multiple test layers: the dedicated continuous-effect suites cover the shared layer machinery, while `must_attack` enforcement for this card is exercised through the command/legal and card-level tests above.

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

### [x] P3.13 — Card: Dance of the Skywise

**Files**: `cards/dance-of-the-skywise.ts`

Cards: **Dance of the Skywise** (target creature you control becomes a blue Dragon Illusion with base power and toughness 4/4, loses all abilities, and gains flying until EOT)

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
