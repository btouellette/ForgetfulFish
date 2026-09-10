# Rules Engine Implementation: Phase 9 — Resolve-effect composition

Status: planned

**Gates Phase 5.** This phase resolves open question 32. It is numbered 9 because it was identified after
Phase 8, but it is scheduled *before* `docs/plans/rules-engine/phase-5-deck-completion.md`: Phase 5 adds 13
cards, and two of them cannot be expressed with today's spec vocabulary at all (see "Forcing cases").

Scope: `packages/game-engine/src/stack/effects/`, `packages/game-engine/src/cards/resolveEffect.ts`,
`packages/game-engine/src/stack/{resolve,onResolveRegistry,stackItem}.ts`, and the 11 shipped card
definitions. No realtime-contract, server, or web change — no new choice types are introduced, so the
transport surface is untouched.

---

## Problem

`CardDefinition.onResolve` is `ResolveEffectSpec[]`: a flat, unconditional list of leaf effects, interpreted
by a 15-arm switch in `stack/effects/handlers.ts` (831 lines). The vocabulary has no composition, so any card
whose behavior is not "do A, then B, then C" has to be encoded as a *new leaf kind that hard-codes that
card's control flow*. Two of the fifteen kinds already are exactly that:

- `draw_by_named_hit` is Predict's "if the named card was milled, draw 2, else draw 1".
- `draw_by_graveyard_self_count` is Accumulated Knowledge's "count copies in graveyard, then draw that many + 1".

Neither is a primitive. Both are a conditional and an arithmetic expression that had nowhere to live, folded
into the leaf that consumed them. That is the growth mechanism the refactor has to remove: every card with
novel control flow costs a union member, a switch arm, a handler function, and — because
`OnResolveRegistry` re-lists spec kinds by name — an edit in a second file far from the handler.

Four secondary problems fall out of the same design:

- **Choice boilerplate is copy-pasted four times.** `choose_cards`, `order_cards`, `name_card`, and
  `choose_mode` each re-implement "no choiceId in scratch → pause; else → parse payload → write scratch",
  each with its own hand-written type guard (`isChooseCardsPayload`, `isOrderCardsPayload`,
  `isNameCardPayload`, `isChooseModePayload` — ~55 lines of near-identical structural checks).
- **Scratch is `Record<string, unknown>` with stringly keys.** `storeKey: "brainstorm:selected"` and
  `sourceKey: "brainstorm:selected"` are linked by hand-namespaced convention only; a mismatch is a runtime
  throw from `readStoredStringArray`, found by a test rather than the compiler.
- **Two parallel resume mechanisms.** The on-resolve loop resumes on a flat integer
  (`scratch.onResolveEffectIndex`) while the pipeline path resumes on `cursor` plus
  `resumeStepIndex:<choiceId>` and a `pipelineChoice:<id>` flag. Flat integer indexing cannot address a node
  in a tree, so branching is not addable without reworking this first.
- **Dead abstraction.** `stack/effects/primitives.ts` exports `StepHandler`, `runStepHandlers`, and
  `getStepIndex`; nothing in the repository calls them. They are the remains of an earlier composition
  attempt and should be deleted or made real, not left as a decoy.

### Forcing cases

These are Phase 5 cards, not hypotheticals:

| Card | Task | Needs | Expressible today? |
|------|------|-------|--------------------|
| Vision Charm | P5.6 | modal — three unrelated effect branches selected by `CHOOSE_MODE` | No. `choose_mode` stores a mode id that nothing can branch on. |
| Diminishing Returns | P5.1 | per-player iteration; "draw up to seven" (count = `7 - handSize`) | No. No iteration; `draw_cards.count` is a literal. |

Without this phase both ship as bespoke `vision_charm_modal` / `diminishing_returns` leaf kinds, which is
the anti-pattern at full size.

---

## Design

### 1. Node tree, not a flat list

`onResolve` becomes a single root node (in practice a `sequence`), with existing leaf specs unchanged:

```ts
type ResolveEffectNode =
  | { kind: "sequence"; children: ResolveEffectNode[] }
  | { kind: "conditional"; if: ResolveCondition; then: ResolveEffectNode; else?: ResolveEffectNode }
  | { kind: "for_each_player"; order: "apnap" | "controller_first"; body: ResolveEffectNode }
  | ResolveEffectSpec; // the existing leaves, minus the two composites deleted below
```

Predict's third step stops being a leaf kind:

```ts
// before                                    // after
{ kind: "draw_by_named_hit",                 { kind: "conditional",
  namedCardKey: "predict:named-card",          if: { kind: "named_card_among",
  milledCardsKey: "predict:milled",                 nameKey: "predict:named-card",
  hitCount: 2, missCount: 1 }                       cardsKey: "predict:milled" },
                                               then: { kind: "draw_cards", count: lit(2), player: "controller" },
                                               else: { kind: "draw_cards", count: lit(1), player: "controller" } }
```

### 2. Expression layer

`ResolveCondition` and `ResolveValue` are small closed unions evaluated against
`ResolveEffectHandlerContext`. They are what let the two composite leaves die:

- values: `literal`, `scratch_number`, `count_in_zone { zone, player, filter }`, `zone_size`, `sum`, `clamp`
- conditions: `named_card_among`, `mode_equals { storeKey, modeId }`, `scratch_present`, `compare { op, left, right }`

`draw_cards.count` widens from `number` to `ResolveValue`, which covers both Accumulated Knowledge
(`sum(count_in_zone(graveyard, self), 1)`) and Diminishing Returns (`clamp(7 - hand_size, min 0)`).

### 3. Path cursor

`scratch.onResolveEffectIndex: number` is replaced by a path into the tree:

```ts
type ResolutionCursor =
  | { kind: "node"; path: number[] }          // replaces { kind: "step"; index }
  | { kind: "waiting_choice"; choiceId: string; resumePath: number[] }
  | { kind: "start" } | { kind: "done" };
```

One mechanism for both the on-resolve walk and the pipeline pause, which removes the
`resumeStepIndex:<choiceId>` / `pipelineChoice:<id>` scratch flags.

**Compatibility**: this changes the persisted shape of in-flight `StackItem`s. Rooms hold engine state in
memory and there is no production traffic, so the plan is a hard cutover with no migration shim — but any
serialized fixture in `test/state/serialization.test.ts` and any stored replay must be regenerated in the
same commit, and this is the one slice that cannot be reverted independently once a game is in flight.

### 4. Handler table with declared metadata

The switch becomes `Record<ResolveEffectKind, EffectHandler>` where each entry declares its own target
requirement:

```ts
const handlers = {
  counter_target_spell: { targets: "stack_object", execute: resolveCounterTargetSpell },
  untap_target:         { targets: "battlefield_object", execute: resolveUntapTarget },
  draw_cards:           { targets: "none", execute: resolveDrawCards },
  // ...
};
```

`OnResolveRegistry` then *derives* `requiresObjectTargets` / `requiresStackObjectTargets` /
`requiresBattlefieldObjectTargets` by walking the node tree and consulting the table, instead of the current
hardcoded `effectSpecs.some(effect => effect.kind === "counter_target_spell" || ...)` chains. The walk must
descend into **both** branches of a `conditional`: targets are chosen at cast time, before any mode choice,
so a card that targets in either branch targets unconditionally.

### 5. One choice primitive

A single `requestChoice(context, { type, prompt, storeKey, constraints, parse })` collapses the four
duplicated pause/parse/store blocks and the four bespoke type guards into one code path plus a parser table
keyed by `ChoiceType`. This is the piece most likely to be copy-pasted 13 more times if Phase 5 goes first.

---

## Tasks

### [ ] P9.1 — Handler table and derived target requirements

**Files**: `stack/effects/handlers.ts`, `stack/onResolveRegistry.ts`

Replace the `resolveOnResolveEffect` switch with a handler table; give each handler a declared `targets`
requirement; make `OnResolveRegistry` derive its three requirement flags from the table. Pure refactor — no
card definition and no test expectation changes.

**Test file**: `test/stack/onResolveRegistry.test.ts` (extend)
Depends: —
Test: **Write tests FIRST**, then implement.
1. Every `ResolveEffectKind` has exactly one table entry (exhaustiveness asserted at type level and at runtime).
2. `requiresStackObjectTargets` is true for `counter_target_spell` and false for `untap_target`.
3. `requiresBattlefieldObjectTargets` is true for each of the four battlefield-targeting kinds.
4. A card with no targeting leaf reports all three requirements false.
5. Adding a table entry with `targets: "stack_object"` is reflected without editing the registry.
6. All 12 existing card test files pass unchanged.
Acceptance: adding a leaf kind requires editing one file, not two.

### [ ] P9.2 — Single choice primitive; delete dead step abstraction

**Files**: `stack/effects/primitives.ts`, `stack/effects/handlers.ts`

Extract `requestChoice` + a payload parser table; rewrite `choose_cards`, `order_cards`, `name_card`, and
`choose_mode` on top of it; delete the four bespoke `isXPayload` guards and the unused `StepHandler` /
`runStepHandlers` / `getStepIndex` exports.

**Test file**: `test/choices/resume.test.ts` (extend), `test/stack/effects/requestChoice.test.ts` (new)
Depends: P9.1
Test: **Write tests FIRST**, then implement.
1. First pass with no stored choiceId pauses with the expected `PendingChoice`.
2. Second pass with a stored payload writes `storeKey` and continues.
3. A payload of the wrong `ChoiceType` throws with the storeKey in the message.
4. A duplicate-id payload throws for `CHOOSE_CARDS` and `ORDER_CARDS`.
5. Zero candidates short-circuits to `continue` without a pause (existing `choose_cards` behavior).
6. Brainstorm, Predict, Mind Bend, and Crystal Spray resolutions are byte-identical to before.
Acceptance: one pause/resume implementation; `primitives.ts` has no unreferenced exports.

### [ ] P9.3 — Path cursor

**Files**: `stack/stackItem.ts`, `stack/resolve.ts`, `stack/effects/types.ts`

Replace `{ kind: "step"; index }` with `{ kind: "node"; path: number[] }`, move the resume path onto
`waiting_choice`, and delete `scratch.onResolveEffectIndex`, `resumeStepIndex:<choiceId>`, and
`pipelineChoice:<id>`. Root stays a flat `sequence`, so paths are length 1 until P9.4 — behavior-preserving
by construction.

**Test file**: `test/stack/stackItem.test.ts` (extend), `test/stack/resolvePipelineChoice.test.ts` (extend), `test/state/serialization.test.ts` (regenerate)
Depends: P9.2
Test: **Write tests FIRST**, then implement.
1. `advanceCursor` walks a flat sequence root as `[0] → [1] → [2] → done`.
2. A pause records `resumePath` and resumes at the same node, not the next one.
3. A pipeline-triggered pause and an effect-triggered pause resume through the same code path.
4. No scratch key matching `onResolveEffectIndex|resumeStepIndex|pipelineChoice` survives a full resolution.
5. Serialization round-trips the new cursor; regenerated fixtures load.
6. `test/integration/replay-determinism.test.ts` is unchanged and green.
Acceptance: one resume mechanism; scratch holds only card data.

### [ ] P9.4 — `sequence` + `conditional` + conditions; retire `draw_by_named_hit`

**Files**: `cards/resolveEffect.ts`, `stack/effects/{conditions.ts,handlers.ts}`, `stack/resolve.ts`, `cards/predict.ts`

Add the node union and the `ResolveCondition` evaluator; wrap every existing card's array in `sequence`;
re-express Predict as `conditional` and delete `draw_by_named_hit` from the union and the table.

**Test file**: `test/stack/effects/conditional.test.ts` (new), `test/cards/predict.test.ts` (extend)
Depends: P9.3
Test: **Write tests FIRST**, then implement.
1. `conditional` with a true condition executes `then` and skips `else`.
2. A missing `else` on a false condition continues without error.
3. A pause inside `then` resumes inside `then`, not at the conditional.
4. Nested `sequence` inside `conditional` resolves depth-first in declaration order.
5. `named_card_among` is true on a hit and false on a miss, matching Predict's old behavior exactly.
6. Predict's existing 8 harness cases pass with no expectation changes.
7. `draw_by_named_hit` no longer exists in `ResolveEffectKind`.
Acceptance: branching is expressible without a new leaf kind.

### [ ] P9.5 — Value expressions; retire `draw_by_graveyard_self_count`

**Files**: `cards/resolveEffect.ts`, `stack/effects/values.ts`, `cards/accumulated-knowledge.ts`

Widen counts to `ResolveValue`; implement `literal`, `scratch_number`, `count_in_zone`, `zone_size`, `sum`,
`clamp`; re-express Accumulated Knowledge and delete `draw_by_graveyard_self_count`.

**Test file**: `test/stack/effects/values.test.ts` (new), `test/cards/accumulatedKnowledge.test.ts` (extend)
Depends: P9.4
Test: **Write tests FIRST**, then implement.
1. `count_in_zone` with a card-definition filter counts only matching objects.
2. `count_in_zone` is evaluated against mutable in-resolution state, not the pre-resolution snapshot.
3. `clamp` floors a negative computed count at zero (the "draw up to N" case).
4. `sum` composes nested values.
5. Accumulated Knowledge draws 1/2/3/4 for 0/1/2/3 copies in the graveyard, as before.
6. `draw_by_graveyard_self_count` no longer exists in `ResolveEffectKind`.
Acceptance: no leaf kind encodes arithmetic for one card.

### [ ] P9.6 — `for_each_player`

**Files**: `cards/resolveEffect.ts`, `stack/effects/handlers.ts`, `mode/gameMode.ts` (read `simultaneousDrawOrder`)

Iteration node binding a current player for its body, ordered through the `GameMode` hook so shared-deck
ordering stays mode-routed. Unblocks P5.1.

**Test file**: `test/stack/effects/forEachPlayer.test.ts` (new)
Depends: P9.5
Test: **Write tests FIRST**, then implement.
1. Body executes once per player in APNAP order.
2. `player: "controller"` inside the body resolves to the *iteration* player, not the spell's controller.
3. A pause in the second iteration resumes in the second iteration (path includes the iteration index).
4. Zone selectors inside the body route through `GameMode`, verified against the shared-deck fixture.
5. Scratch written in one iteration does not leak into the next.
6. `assertStateInvariants` passes after each iteration.
Acceptance: per-player effects need no per-card leaf kind.

### [ ] P9.7 — Typed scratch references

**Files**: `cards/resolveEffect.ts`, `stack/effects/handlers.ts`, all card definitions

Replace `storeKey: string` / `sourceKey: string` with a branded `ScratchRef<T>` created per card
(`scratchRef<string[]>("brainstorm:selected")`), so a writer/reader type or name mismatch is a compile error
instead of a runtime throw. Update the card-authoring section of the plan README.

**Test file**: `test/stack/effects/scratchRef.test.ts` (new)
Depends: P9.6
Test: **Write tests FIRST**, then implement.
1. A `ScratchRef<string[]>` read as `string` fails to typecheck (Vitest `expectTypeOf`; needs `typecheck` enabled in the game-engine Vitest config).
2. Round-trip write/read preserves value and type.
3. Reading an unwritten ref throws with the ref name.
4. Two cards using the same logical name get distinct namespaced keys.
5. All 12 card test files pass unchanged.
Acceptance: no raw string scratch keys remain in card definitions.

---

## Exit Criteria

- `ResolveEffectSpec` contains only genuine primitives; no leaf kind encodes one card's control flow.
- `handlers.ts` is a dispatch table; branching, iteration, and arithmetic live in their own modules.
- One pause/resume mechanism and one choice primitive.
- Predict and Accumulated Knowledge are expressed compositionally, with unchanged test expectations.
- Vision Charm (P5.6) and Diminishing Returns (P5.1) are expressible without new leaf kinds — demonstrated
  by a spec-only fixture test, ahead of those cards being implemented.
- 62 existing test files green; `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Notes

- Migration surface is small *now* and only grows: 11 card definitions, of which 9 are a mechanical wrap in
  `sequence` and 2 change shape. After Phase 5 it is 24.
- P9.1-P9.3 are behavior-preserving and can land without any card change; P9.4-P9.6 are the capability
  additions Phase 5 depends on. P9.7 is hygiene and may trail Phase 5 if schedule pressure demands.
- No transport impact: no new `ChoiceType`, so `packages/realtime-contract` and the web client are untouched.
