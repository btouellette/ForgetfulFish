# Phase 3 Gate PR Implementation Plan

This document defines the implementation plan for the five Phase 3 gate items identified in the Phase 2 audit. Each item is planned as a separate pull request with isolated scope.

## Planning assumptions

- Base branch for all PRs is `main`.
- One branch and one PR per item.
- No PR imports game-engine internals into apps.
- Public boundary remains `@forgetful-fish/game-engine` exports only.
- Validation for each PR includes targeted tests, typecheck, and build for touched packages.

## Phase task status

- [ ] PR 1 - Command-Application Boundary + Cross-Boundary Contract Test
- [x] PR 2 - Mixed Deck Bootstrap for E2E Coverage
- [ ] PR 3 - Realtime/API Gameplay Contract Schemas
- [x] PR 4 - Pending-Choice Legal Command Output Fix
- [x] PR 5 - Scaling Improvements (Hot-Path)

## PR 1 - Command-Application Boundary + Cross-Boundary Contract Test

### Goal

Add a clean server-side command application path that:

1. Loads persisted game state.
2. Applies a command through `processCommand`.
3. Persists updated state and emitted events atomically.
4. Returns a stable response contract for app-level integration tests.

### Scope

- Add a gameplay endpoint in server app.
- Add command payload schema validation.
- Add room/game membership and authorization checks.
- Add persistence update flow (`games.state`, `stateVersion`, `lastAppliedEventSeq`, `game_events`).
- Add cross-boundary contract tests using in-memory store and/or DB-backed path as appropriate.

### Proposed files

- `apps/server/src/app.ts`
- `apps/server/src/schemas.ts`
- `apps/server/src/room-store/types.ts`
- `apps/server/src/room-store/index.ts`
- New room-store module(s), likely:
  - `apps/server/src/room-store/apply-command.ts`
- `apps/server/test/app-rooms-http.test.ts` (or dedicated gameplay test file)
- `apps/server/test/helpers/app-test-helpers.ts`

### Implementation steps

1. Define request/response schemas for command application route.
2. Add room-store method signature for applying a command to a started game.
3. Implement store logic:
   - verify room + participation + game existence,
   - deserialize state,
   - apply `processCommand(state, command, rng)`,
   - emit/persist events with monotonic sequence,
   - persist serialized next state + versions.
4. Wire route in `app.ts` behind auth middleware.
5. Add tests for:
   - unauthorized,
   - not participant,
   - room/game not found,
   - successful command application updates state + events,
   - deterministic replay behavior for identical command stream.

### Acceptance criteria

- App can apply gameplay commands without importing engine internals.
- State/event persistence updates are atomic and sequence-consistent.
- Contract tests prove command -> engine -> persistence pipeline correctness.

### Risk / complexity

- **Risk:** sequence/version drift if persistence ordering is wrong.
- **Mitigation:** test sequence increments and exact event counts per command.

### Estimated effort

- **Medium** (1-2 days).

---

## PR 2 - Mixed Deck Bootstrap for E2E Coverage

### Goal

Replace island-only startup decks with a deterministic mixed deck preset that includes currently implemented Phase 2 spells so E2E can exercise choices/pipeline behavior.

### Scope

- Update game start bootstrap in server (DB room-store path).
- Update in-memory room store test helper to use same canonical test preset.
- Update tests asserting expected initial state.

### Proposed files

- `apps/server/src/room-store/start-game.ts`
- `apps/server/test/helpers/app-test-helpers.ts`
- `apps/server/test/app-rooms-http.test.ts`

### Implementation steps

1. Create a small deterministic deck preset (e.g., Islands + Brainstorm + Predict + Memory Lapse + Mystical Tutor + Accumulated Knowledge).
2. Use that preset in `startGameInDatabase`.
3. Mirror preset in in-memory helper to keep tests aligned.
4. Update snapshot/expectation tests for initial state construction.
5. Verify start remains idempotent.

### Acceptance criteria

- Newly started games include playable nonland spells from implemented set.
- Existing room/start flows continue to pass.
- Test helpers and DB path use the same deck composition.

### Risk / complexity

- **Risk:** brittle tests if deck composition is duplicated.
- **Mitigation:** centralize preset builder in a shared helper.

### Estimated effort

- **Short** (0.5 day).

---

## PR 3 - Realtime/API Gameplay Contract Schemas

### Goal

Add explicit gameplay message contracts so transport and tests can rely on typed command/event payload boundaries.

### Scope

- Extend realtime contract package with gameplay inbound/outbound schemas.
- Add server-side schema usage where practical (route validation and response shaping).
- Add contract tests for schema validation and compatibility.

### Proposed files

- `packages/realtime-contract/src/index.ts`
- `apps/server/src/schemas.ts`
- `apps/server/test/*` (new or updated contract tests)

### Implementation steps

1. Add schemas for gameplay command submission payload.
2. Add schemas for gameplay response payload (new state version, pending choice, emitted events metadata).
3. Export inferred TS types.
4. Use schemas in server route handler(s).
5. Add tests for valid/invalid payloads and schema version compatibility.

### Acceptance criteria

- Gameplay transport contracts are explicit and versioned.
- Server rejects invalid gameplay payloads deterministically.
- Contract package is reusable by app/web and server tests.

### Risk / complexity

- **Risk:** over-coupling transport schema to full engine internals.
- **Mitigation:** keep contract focused on boundary DTOs, not full engine object graphs.

### Estimated effort

- **Short to Medium** (0.5-1 day).

---

## PR 4 - Pending-Choice Legal Command Output Fix

### Goal

Stop advertising invalid placeholder `MAKE_CHOICE` payloads from `getLegalCommands` when a pending choice exists.

### Scope

- Refactor legal-command generation for pending choices.
- Keep compatibility with current command model while ensuring validity.
- Add tests covering all pending choice kinds currently represented.

### Proposed files

- `packages/game-engine/src/commands/validate.ts`
- `packages/game-engine/test/commands/legal.test.ts`
- Potentially `packages/game-engine/test/choices/resume.test.ts`

### Implementation steps

1. Replace default placeholder payload generation with one of:
   - a strict minimal valid payload strategy per choice type, or
   - a sentinel command model that requires client-supplied payload from constraints.
2. Ensure generated commands are valid inputs to `resumeChoiceResolution` where applicable.
3. Add regression tests for each pending choice type.
4. Confirm no regressions in command legality tests.

### Acceptance criteria

- `getLegalCommands` never emits structurally invalid pending-choice payloads.
- Existing command validation/resume tests stay green.

### Risk / complexity

- **Risk:** changing UI assumptions about one-click default choices.
- **Mitigation:** preserve command shape and document semantics in tests.

### Estimated effort

- **Short** (0.5 day).

---

## PR 5 - Scaling Improvements (Hot-Path)

### Goal

Address identified scaling risks that will degrade as decklists/cards grow.

### Planned sub-scope for this PR

1. Replace RNG shuffle algorithm from O(n^2) splice-based to O(n) Fisher-Yates.
2. Reduce repeated full scans in one additional hot path without redesigning architecture.

### Scope boundaries

- No broad state model rewrite in this PR.
- No new storage infrastructure.
- Keep deterministic behavior and seed progression stable (or explicitly versioned if change is intentional).

### Proposed files

- `packages/game-engine/src/rng/rng.ts`
- `packages/game-engine/test/rng/rng.test.ts`
- Potential hot-path target candidates:
  - `packages/game-engine/src/engine/sba.ts`
  - `packages/game-engine/src/actions/executor.ts`
  - `packages/game-engine/src/engine/kernel.ts`

### Implementation steps

1. Implement deterministic Fisher-Yates shuffle using existing RNG calls.
2. Add/adjust tests to lock determinism and permutation correctness.
3. Add one bounded optimization in SBA/zone operations (e.g., avoid redundant scans/copies in common path).
4. Validate with existing integration/determinism test suite.

### Acceptance criteria

- Shuffle complexity improvement is measurable by algorithmic analysis and code path.
- Existing determinism tests remain green.
- No behavior regressions in game-engine suite.

### Risk / complexity

- **Risk:** changing shuffle sequence can break expected deterministic fixtures.
- **Mitigation:** update fixtures intentionally and verify replay-determinism invariants hold.

### Estimated effort

- **Medium** (1 day).

---

## Execution order

Recommended PR order to reduce rebase churn and unblock E2E fastest:

1. PR 2 (mixed deck bootstrap)
2. PR 4 (legal command fix)
3. PR 3 (contract schemas)
4. PR 1 (command-application boundary)
5. PR 5 (scaling improvements)

Rationale: PR 2/4 are short and de-risk PR 1 integration tests; PR 3 stabilizes contracts before route implementation; PR 5 is mostly orthogonal and can merge last.

## Validation checklist per PR

- Run targeted package tests.
- Run touched package typecheck/build.
- Ensure only public engine exports are used from app code.
- Add at least one regression test for the addressed issue.
- Keep PR scope constrained to one item only.
