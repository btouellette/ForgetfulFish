# Working Backlog

Status: active follow-up items that are not already tracked in a dedicated plan doc.

The operational items below are deferred until a launch date is in sight and are tracked at milestone level
under Milestone 5 in `docs/plans/roadmap.md`. Feature work is planned in `docs/plans/rules-engine/` and
`docs/plans/product-surface/`; do not add feature items here.

## Current Follow-ups

- [ ] Rotate all `.env` secrets after development is complete.
- [ ] Add uptime and health monitoring for `forgetful-fish-web` and `forgetful-fish-postgres`.
- [ ] Define database backup policy, including periodic restore drills.
- [ ] Document the upgrade cadence for Node, Next.js, Prisma, and Postgres images (advisory backlog itself was cleared; versions are pinned via direct deps and `pnpm.overrides`).
- [ ] Evaluate and fix outdated client behavior after deploys.
- [ ] Decide the room expiry policy for long-idle games, together with the rematch-or-close decision in `docs/plans/product-surface/phase-ps2-game-result-surfacing.md`.
- [ ] Evaluate Discord chat room creation integration.
