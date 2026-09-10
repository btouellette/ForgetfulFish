# Product Surface Phase PS1 — Combat in the client

Status: planned

**Reachability gap this phase closes**: the engine accepts `DECLARE_ATTACKERS` and `DECLARE_BLOCKERS`
(shipped in rules-engine Phase 4 slices A and B, routed by `apps/server/src/room-store/apply-command.ts`),
but no browser can send either command, and the deck a real room is dealt contains no creatures. Combat is
therefore unreachable and untestable outside engine unit tests.

Concretely:

- `legalActionsViewSchema` in `packages/realtime-contract/src/index.ts` exposes only `hand`, `battlefield`,
  `passPriority`, `concede`, and `choice`.
- `apps/web/lib/stores/game-store.ts` has no attacker/blocker submission path.
- `apps/server/src/room-store/deck-preset.ts` is 14 Island plus 6 spells, so Dandan, Mind Bend, Crystal
  Spray, Ray of Command, and Dance of the Skywise are unreachable in-app even though they are implemented.

**Depends**: `P6.7` (engine emits combat entries in `LegalActionsView`). `PS1.4` additionally depends on
`P4.3` (combat damage) for a damage assertion; the declare/block flow can land before damage exists.

## Slices

### [ ] PS1.1 — Mirror combat legal actions in the transport contract

**Files**:

- `packages/realtime-contract/src/index.ts`
- `packages/realtime-contract/test/schema.test.ts`

**Test-first**:

1. Failing test: `legalActionsViewSchema` accepts an `attack` section listing declarable attacker object ids.
2. Failing test: schema accepts a `block` section mapping blocker object id to the attacker ids it may legally block.
3. Failing test: both sections default to empty (not absent) outside their combat steps, so clients need no optionality branch.
4. Failing test: unknown keys are still rejected (`.strict()` preserved) and `DECLARE_ATTACKERS`/`DECLARE_BLOCKERS` command payloads round-trip.

**Acceptance**:

- The contract mirrors the engine `LegalActionsView` shape exactly; no client-side derivation of combat legality.
- Change is recorded per the evolution policy in `docs/contracts/gameplay-transport-contract.md`.

**Commit target**: `Add combat sections to legal actions contract`

---

### [ ] PS1.2 — Attacker and blocker submission in the game store

**Files**:

- `apps/web/lib/stores/game-store.ts`
- `apps/web/lib/stores/game-store.test.ts`
- `apps/web/lib/auto-pass.ts`
- `apps/web/lib/auto-pass.test.ts`

**Test-first**:

1. Failing test: `declareAttackers(attackerIds)` submits a single `DECLARE_ATTACKERS` command and clears local selection on success.
2. Failing test: `declareBlockers(assignments)` submits `DECLARE_BLOCKERS` with the blocker-to-attacker mapping.
3. Failing test: declaring no attackers is a valid submission (empty declaration), not a no-op.
4. Failing test: a rejected declaration surfaces the server error and restores the prior selection.
5. Failing test: auto-pass does not skip a combat step in which the viewer has a non-empty `attack`/`block` section.

**Acceptance**:

- Combat selections follow the existing server-authoritative refetch model; no optimistic combat state.

**Commit target**: `Add declare attackers and blockers to game store`

---

### [ ] PS1.3 — Combat declaration UI

**Files**:

- `apps/web/components/play/CombatPanel.tsx` (new)
- `apps/web/components/play/CombatPanel.module.css` (new)
- `apps/web/components/play/CombatPanel.test.tsx` (new)
- `apps/web/components/play/GameplayView.tsx`
- `apps/web/components/play/GameplayView.test.tsx`

**Test-first**:

1. Failing test: during `DECLARE_ATTACKERS` the active player can toggle each legal attacker and confirm.
2. Failing test: creatures absent from the `attack` section are rendered non-selectable with the reason surfaced (tapped, summoning sick, Dandan without an Island).
3. Failing test: required attackers (must-attack) are pre-selected and cannot be deselected.
4. Failing test: during `DECLARE_BLOCKERS` the defending player assigns a blocker to one of its legal attackers and confirms.
5. Failing test: the non-acting player sees declared attackers/blocks read-only, with no submit control.
6. Failing test: the panel is absent outside combat steps.

**Acceptance**:

- A full attack and block can be declared by both players using only browser input.
- Illegal declarations are prevented client-side for clarity but the server remains authoritative.

**Commit target**: `Add combat declaration panel`

---

### [ ] PS1.4 — Reachable deck preset and combat E2E

**Files**:

- `apps/server/src/room-store/deck-preset.ts`
- `apps/server/test/*` (preset coverage)
- `e2e/room-realtime.spec.ts`

**Test-first**:

1. Failing test: the preset contains every card id in the engine card registry that is legal in the canonical decklist, so no implemented card is unreachable.
2. Failing test: the preset still satisfies the deck-size and land-count expectations the room start gate relies on.
3. Failing E2E: two players reach `DECLARE_ATTACKERS` with a Dandan on the battlefield, declare an attack, declare a block, and both clients converge on the same post-combat state.

**Acceptance**:

- A preset-reachability test fails whenever a card is added to the registry but not to the preset, so this gap cannot silently reopen.
- The E2E asserts life totals after damage once `P4.3` has landed; until then it asserts the declaration state only, with the damage assertion marked `Deferred: P4.3`.

**Commit target**: `Make implemented cards reachable and cover combat end to end`

## Exit Criteria

- Attacking and blocking are performable from the browser by both players.
- Every implemented card can appear in a real room's deck.
- Combat is covered by at least one deterministic E2E flow.
