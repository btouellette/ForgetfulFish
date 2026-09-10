# Current Workstream Plan

Status: active. Consolidated status review plus the ordered execution plan for the next development wave.
Supersedes ad hoc sequencing notes in `docs/plans/roadmap.md` for Milestone 3 remainder; roadmap stays the milestone-level view.

## Status Snapshot (reviewed 2026-09-10)

- Repo health is green: `pnpm lint`, `pnpm typecheck`, `pnpm test` (804 tests), and `pnpm format:check` all pass on `main`; CI on `main` is green; no open PRs or issues; no `TODO`/`FIXME` markers or type assertions in source.
- Shipped: auth/rooms/lobby/start gate, realtime transport, web gameplay shell, engine phases 0-3, and Phase 4 slices A (declare attackers) and B (declare blockers).
- Not shipped: combat damage, triggers, game-end surfacing, 13 of 24 deck cards, mulligan.

Implemented card registry (`packages/game-engine/src/cards/index.ts`): Island, Brainstorm, Predict, Memory Lapse, Mystical Tutor, Accumulated Knowledge, Dandan, Mind Bend, Crystal Spray, Dance of the Skywise, Ray of Command.

## Blocking Issues to Clear Before New Feature Work

Ordered by impact on the playable product.

### [ ] I1 - Combat cannot deal damage, so no game can be won on board

`COMBAT_DAMAGE` exists as a step in `packages/game-engine/src/engine/kernel.ts` but no damage is assigned or dealt; combat currently passes through as a no-op. Phase 4 Slice C is the direct fix and must land before any further combat/trigger or card work.

### [ ] I2 - Game end is invisible outside the engine

`hasLost` is set by `engine/sba.ts` and `engine/processCommand.ts`, but it is absent from `playerGameViewSchema` in `packages/realtime-contract/src/index.ts`, is never broadcast, has no representation on the Prisma `Game` model (no status/winner/ended-at), and has no UI. A conceding player and the winner both see nothing change.

### [ ] I3 - The playable deck excludes every card shipped since the prototype

`apps/server/src/room-store/deck-preset.ts` is 14 Island plus 6 spells and contains no creatures. Dandan, Mind Bend, Crystal Spray, Ray of Command, and Dance of the Skywise are unreachable from the product, so combat and all Phase 3 layer work cannot be exercised in-app or in E2E.

### [ ] I4 - Combat commands are not reachable from clients

`legalActionsViewSchema` exposes only `hand`, `battlefield`, `passPriority`, `concede`, and `choice`; `apps/web/lib/stores/game-store.ts` has no `DECLARE_ATTACKERS`/`DECLARE_BLOCKERS` path even though `apps/server/src/room-store/apply-command.ts` accepts both. Engine-side combat legality is therefore untestable through the browser.

### [ ] I5 - Mulligan is v1 scope with no owner

The free-mulligan rule (redraw when a 7-card opener has fewer than 2 or at least 6 lands) appears only in `docs/overview/product-overview.md`. No engine command, transport field, UI, or phase plan covers it.

### [ ] I6 - Security advisories in the production dependency graph

`pnpm audit --prod` reports 48 high/critical advisories, including critical ones for `next-auth` (pinned at `5.0.0-beta.30`) and `@auth/core` (via `@auth/prisma-adapter`), plus high advisories for `next`, `fastify`, and `ws`. This overlaps the existing "pin and document the upgrade cadence" backlog item in `TODO.md`, which has no schedule.

### [ ] I7 - Production operability gaps

No uptime/health monitoring; `forgetful-fish-web` has no healthcheck in `docker-compose.production.yml` while `forgetful-fish-server` does; no database backup or restore-drill policy; `.env` secrets still need rotation; stale-client behavior after deploys is unhandled. All are listed in `TODO.md` and none are scheduled.

### [ ] I8 - Repository and plan hygiene

Four remote branches are superseded by `main` and should be deleted: `copilot/sub-pr-27`, `copilot/sub-pr-29`, `feat/p3-2-compute-game-object`, `feat/phase1-realtime-e2e`. Two deferrals also need an explicit decision before Phase 5 grows the card set: the composable `sequence`/`conditional` resolve-spec refactor (still a monolithic `ResolveEffectSpec` union plus a switch interpreter in `stack/effects/handlers.ts`) and Layer 3 color-word rewriting.

## Execution Plan

Each step keeps the test-first workflow in `docs/standards/ai-tooling-rules.md` and lands as its own PR.

### [ ] S1 - Combat damage and SBA convergence (Phase 4 Slice C)

Clears I1. Implement damage assignment/resolution on stored attacker/blocker state, emit `DAMAGE_DEALT` and `LIFE_CHANGED`, and converge through the existing SBA loop. Scope and tests are already specified in `docs/plans/rules-engine/phase-4-combat-and-triggers.md`.

### [ ] S2 - Game-end surfacing end to end

Clears I2. Add a result field to the player view and command response contracts, persist game completion on the Prisma `Game` model, broadcast it over `room_game_updated`, and render a terminal game-over state in the web shell. Decide at the same time whether a finished room supports a rematch or is closed, which also unblocks the room-expiry backlog item.

### [ ] S3 - Combat in the client path

Clears I3 and I4. Extend the legal-actions manifest with attack/block sections, add the corresponding store commands and UI, and swap `deck-preset.ts` to a slice that includes Dandan plus the shipped Phase 3 cards. Extend `e2e/room-realtime.spec.ts` with an attack/block/damage flow.

### [ ] S4 - Dependency and operations hardening

Clears I6 and I7. Upgrade the flagged production dependencies (auth stack first), record the pinning/upgrade cadence, add a web healthcheck plus uptime monitoring, and define the backup/restore-drill policy. Rotate `.env` secrets as part of the same pass.

### [ ] S5 - Triggers (Phase 4 Slice D)

Trigger batching, APNAP ordering, and state-trigger plumbing on the existing event/choice/SBA surfaces. Required before the Phase 4 card slice and before Dandan's state trigger can be correct.

### [ ] S6 - Resolve-spec composition decision

Clears the first half of I8's deferral list. Decide whether to land the composable resolve-spec refactor before Phase 5 adds 13 more cards, and record the outcome in `docs/decisions/decision-log.md`. Doing it after Phase 5 means migrating a much larger card surface.

### [ ] S7 - Phase 4 cards and integration coverage (Slice E)

Mystic Sanctuary, Halimar Depths, Temple of Epiphany, Izzet Boilerworks, and Dandan's state trigger, plus the combat/trigger integration scenarios.

### [ ] S8 - Mulligan flow

Clears I5. Add the opening-hand and free-mulligan rules to the engine, transport, and lobby-to-game handoff, with the free-mulligan condition from the product overview.

### [ ] S9 - Phase 5 deck completion

Remaining 13 cards, with the P7.2 coverage tracker kept current as each card lands.

## Exit Criteria

- Two players can play a full game to a decided result in the browser, including combat damage, and both clients see the result.
- Every implemented card is reachable from the deck preset used by real rooms.
- No high or critical advisories in the production dependency graph, and the upgrade cadence is documented.
- `TODO.md` operational items are either done or explicitly scheduled in this plan.
