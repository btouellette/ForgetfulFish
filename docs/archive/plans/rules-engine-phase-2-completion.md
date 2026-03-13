# Rules Engine Phase 2 Completion Plan

Status: completed historical plan.
Archived because: the active rules-engine implementation plan now lives in split phase files under `docs/plans/rules-engine/`.
Current reference: `docs/plans/rules-engine/phase-2-stack-resolution-and-choices.md`.

This plan is constrained to finishing out Phase 2 from `docs/plans/rules-engine/README.md` and does not include Phase 3+ scope.

## Phase 2 Completion Goals

- Complete the end-to-end path: resolve effects -> whiteboard actions -> pipeline -> applied state changes.
- Fully wire replacement-choice pause/resume so `CHOOSE_REPLACEMENT` is not a dead-end.
- Continue reducing card-specific resolve logic in favor of typed/composable effect patterns.
- Preserve deterministic replay semantics (same seed + commands + choices => same state/events).

## Out of Scope

- Continuous effect layers and duration tracking (Phase 3).
- Combat/triggers and APNAP ordering (Phase 4).
- Remaining deck completion and advanced mechanics (Phase 5+).

## Slice Dependency Graph

- Slice 1 -> Slice 2 -> Slice 3 -> Slice 4 -> Slice 5 -> Slice 6 -> Slice 7 -> Slice 8
- Slice 7 can begin in parallel with late Slice 6 test hardening if acceptance criteria in Slice 6 are met.

## PR Submission Tracker

- [x] PR A - Resolve Effect Type and Registry Foundation ([#61](https://github.com/btouellette/ForgetfulFish/pull/61))
- [x] PR B - Resolver Dispatch + Effect Handler Extraction ([#62](https://github.com/btouellette/ForgetfulFish/pull/62))
- [x] PR C - Card Migration to Structured Resolve Specs ([#63](https://github.com/btouellette/ForgetfulFish/pull/63))
- [x] PR D - Pipeline Replacement Wiring and Choice Surfacing ([#64](https://github.com/btouellette/ForgetfulFish/pull/64))
- [x] PR E - Command Validation Hot-Path Tightening ([#65](https://github.com/btouellette/ForgetfulFish/pull/65))

## Slice 1 - Determinism and Replay Baseline

### Objective

Add explicit deterministic replay guardrails before further engine rewiring.

### Expected File Touches

- `packages/game-engine/test/**` (new determinism/replay focused tests)
- `packages/game-engine/src/engine/processCommand.ts` (only if required for deterministic assertions)

### Tests First

- Given identical initial state + identical command/choice sequence, final state hash and event sequence are identical.
- Pause/resume around pending choices is deterministic.

### Acceptance Criteria

- Determinism tests pass and are stable across repeated runs.
- No functional behavior changes introduced beyond test harness additions.

## Slice 2 - Action Executor Foundation

### Objective

Introduce a single action execution layer to apply `GameAction[]` to `GameState` deterministically.

### Expected File Touches

- `packages/game-engine/src/actions/executor.ts` (new)
- `packages/game-engine/src/actions/action.ts` (if type extensions are needed)
- `packages/game-engine/test/actions/**` (new executor-focused tests)

### Tests First

- Unit tests for each supported action type (draw/move/counter/shuffle/etc.)
- Input immutability and deterministic order tests

### Acceptance Criteria

- `applyActions(state, actions)` exists as a pure, deterministic entrypoint.
- Action execution order is explicit and tested.

## Slice 3 - Resolver/Pipeline to Executor Wiring

### Objective

Stop dropping pipeline output actions; execute them in the stack-resolution flow.

### Expected File Touches

- `packages/game-engine/src/stack/resolve.ts`
- `packages/game-engine/src/actions/pipeline.ts`
- `packages/game-engine/test/stack/**`

### Tests First

- Resolve path with generated whiteboard actions runs through pipeline and mutates state via executor.
- Existing card behavior remains unchanged for current implemented cards.

### Acceptance Criteria

- `runPipelineWithResult(...)` output actions are executed when no pending choice is returned.
- Behavior remains deterministic and current tests stay green.

## Slice 4 - Replacement Choice Resume End-to-End

### Objective

Complete `CHOOSE_REPLACEMENT` resume flow so selected replacement drives continuation.

### Expected File Touches

- `packages/game-engine/src/effects/replacement/applyOnce.ts`
- `packages/game-engine/src/choices/resume.ts`
- `packages/game-engine/src/stack/resolve.ts`
- `packages/game-engine/test/effects/replacement/**`
- `packages/game-engine/test/stack/resolvePipelineChoice.test.ts`

### Tests First

- Conflicting replacements produce `CHOOSE_REPLACEMENT`.
- Submitting a valid replacement choice resumes and applies exactly once.
- Invalid/stale choice is rejected without partial mutation.

### Acceptance Criteria

- Replacement pause/resume is complete, deterministic, and non-duplicative.

## Slice 5 - Handler Migration to Action-Producing Primitives

### Objective

Shift handler internals from bespoke state mutation toward composable action emission.

### Expected File Touches

- `packages/game-engine/src/stack/effects/handlers.ts`
- `packages/game-engine/src/stack/effects/primitives.ts`
- `packages/game-engine/src/stack/effects/types.ts`
- `packages/game-engine/test/cards/**`

### Tests First

- For each migrated effect path, pre/post behavior parity tests.
- Choice interruption/resume tests remain green.

### Acceptance Criteria

- Handler logic is primarily spec/primitives + action output, not ad hoc deep mutation.

## Slice 6 - Structured Resolve Effect Specs (Beyond ID-Only)

### Objective

Evolve `ResolveEffectSpec` from `{ id }` to typed payload specs that encode effect parameters.

### Expected File Touches

- `packages/game-engine/src/cards/resolveEffect.ts`
- `packages/game-engine/src/cards/cardDefinition.ts`
- `packages/game-engine/src/cards/*.ts` (incremental migration)
- `packages/game-engine/test/cards/**`

### Tests First

- Spec schema tests for compile-time and runtime shape guarantees.
- Card migration tests prove behavioral parity.

### Acceptance Criteria

- New card behaviors can be represented as data + reusable primitives without core branching growth.

## Slice 7 - Scale Hardening in Hot Paths

### Objective

Prepare Phase 2 systems for larger decklists/card pools by indexing/caching hot-path lookups.

### Expected File Touches

- `packages/game-engine/src/commands/validate.ts`
- `packages/game-engine/src/effects/replacement/registry.ts`
- `packages/game-engine/test/commands/**`
- `packages/game-engine/test/effects/replacement/**`

### Tests First

- Larger synthetic state scenarios for legal-command generation and replacement matching.
- Deterministic ordering tests for indexed lookup results.

### Acceptance Criteria

- Hot paths avoid avoidable repeated scans while preserving deterministic behavior.

## Slice 8 - Phase 2 Completion Gate

### Objective

Close Phase 2 explicitly with a completion checklist and focused integration coverage.

### Expected File Touches

- `packages/game-engine/test/**` (integration/regression additions)
- `docs/plans/rules-engine/README.md` (status updates)
- `docs/decisions/decision-log.md` (if architecture decisions changed)

### Tests First

- Full implemented Phase 2 card set integration tests.
- Replacement/choice torture path tests.
- Determinism replay test suite from Slice 1 as required gate.

### Acceptance Criteria

- Phase 2 implementation behavior matches architecture intent for:
  - persisted effect context and choice resumption,
  - action pipeline with replacement handling,
  - staleness/fizzle validation,
  - implemented card behaviors.

## Proposed PR-Sized Chunks For Current In-Progress Work

These chunks reflect current modified/untracked files in the working tree and can be reviewed independently.

### PR A - Resolve Effect Type and Registry Foundation

- Files:
  - `packages/game-engine/src/cards/resolveEffect.ts`
  - `packages/game-engine/src/stack/onResolveRegistry.ts`
  - `packages/game-engine/test/stack/onResolveRegistry.test.ts`
  - `packages/game-engine/src/cards/cardDefinition.ts`
  - `packages/game-engine/src/cards/index.ts`
- Goal: introduce typed `onResolve` specs and lightweight registry infrastructure.
- Risk: low.

### PR B - Resolver Dispatch + Effect Handler Extraction

- Files:
  - `packages/game-engine/src/stack/resolve.ts`
  - `packages/game-engine/src/stack/effects/types.ts`
  - `packages/game-engine/src/stack/effects/primitives.ts`
  - `packages/game-engine/src/stack/effects/handlers.ts`
- Goal: replace large inline resolve branching with centralized dispatch + reusable primitives.
- Risk: medium (core resolution flow).
- Depends on: PR A.

### PR C - Card Migration to Structured Resolve Specs

- Files:
  - `packages/game-engine/src/cards/brainstorm.ts`
  - `packages/game-engine/src/cards/memory-lapse.ts`
  - `packages/game-engine/src/cards/mystical-tutor.ts`
  - `packages/game-engine/src/cards/predict.ts`
  - `packages/game-engine/src/cards/accumulated-knowledge.ts`
  - `packages/game-engine/test/cards/accumulatedKnowledge.test.ts`
- Goal: migrate implemented Phase 2 cards to spec-driven `onResolve` shape.
- Risk: low-medium.
- Depends on: PR A and PR B.

### PR D - Pipeline Replacement Wiring and Choice Surfacing

- Files:
  - `packages/game-engine/src/actions/pipeline.ts`
  - `packages/game-engine/src/effects/replacement/registry.ts`
  - `packages/game-engine/src/effects/replacement/applyOnce.ts`
  - `packages/game-engine/test/actions/pipeline.test.ts`
  - `packages/game-engine/test/stack/resolvePipelineChoice.test.ts`
- Goal: integrate replacement rewrite behavior into pipeline with deterministic choice surfacing.
- Risk: medium.
- Depends on: PR B.

### PR E - Command Validation Hot-Path Tightening

- Files:
  - `packages/game-engine/src/commands/validate.ts`
- Goal: improve legality checks/caching for current resolve/pipeline behavior.
- Risk: low.
- Depends on: can merge independently, but easiest after PR B/D.

## Note on Workspace Hygiene

- `.sisyphus/**` is local workspace metadata and should not be included in PRs.
