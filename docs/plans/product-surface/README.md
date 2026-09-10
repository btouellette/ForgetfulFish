# Product Surface Implementation Plan

Status: active implementation reference for everything between the rules engine and the browser.

`docs/plans/rules-engine/` owns `packages/game-engine/`. This series owns the layers that make engine
behavior reachable and visible to players: `packages/realtime-contract/`, `apps/server/`, `apps/web/`,
`packages/database/`, and `e2e/`. The two series are deliberately separated so an engine agent and a
product-surface agent can work the same milestone without touching the same files.

## Phase Files

- `docs/plans/product-surface/phase-ps1-combat-in-the-client.md`
- `docs/plans/product-surface/phase-ps2-game-result-surfacing.md`
- `docs/plans/product-surface/phase-ps3-mulligan-experience.md`

Completed predecessor: `docs/plans/web-prototype-current-cards.md` (prototype loop for the Phase 0-2 card
slice). That plan is closed; new product-surface work belongs in a phase file here rather than as an
extension of the prototype plan.

## Conventions

- Tasks are numbered within their phase (`PS1.1`, `PS1.2`) and are independently verifiable.
- "Depends:" may reference either series; cross-series dependencies must name the engine task
  (for example `Depends: P4.3`) so the blocking side is unambiguous.
- Test-first is mandatory, per `docs/standards/ai-tooling-rules.md`: the listed failing tests are written
  before implementation.
- File paths are repository-relative.
- Transport changes must follow the evolution policy in `docs/contracts/gameplay-transport-contract.md`.
- Web changes must follow `docs/standards/nextjs-boundary-rules.md`.

## Ownership Boundary

| Concern | Owner |
|---|---|
| Rules legality, state mutation, events, projection redaction | `docs/plans/rules-engine/` |
| Realtime schemas, server command routing, persistence, UI, E2E | this series |

When an engine capability exists but is unreachable from a browser, the gap is a product-surface phase
item, not an engine one. That inversion is what allowed Phase 4 combat to ship with no way to declare
attackers from the UI; each phase file below opens with the reachability gap it closes.

## Baseline (reviewed 2026-09-10)

Shipped: auth, rooms/lobby/start gate, realtime transport with reconnect/resync, gameplay shell, and the
prototype card interactions (`PLAY_LAND`, `CAST_SPELL` with targets, `PASS_PRIORITY`, `MAKE_CHOICE`,
`CONCEDE`).

Not reachable from the product despite existing in the engine: attacker/blocker declaration, every card
shipped after the prototype slice (Dandan, Mind Bend, Crystal Spray, Ray of Command, Dance of the
Skywise), and loss/game-end state.
