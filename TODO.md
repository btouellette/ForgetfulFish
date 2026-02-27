# TODO

## Milestone 1 - Private Rooms + Start Gate

- [x] Add lobby UI on `/play/:roomId` showing participants, seat (`P1`/`P2`), and room status.
- [x] Add room readiness state model (per-player `ready`/`not_ready`) in server + database.
- [x] Add endpoints/actions to toggle readiness for the authenticated participant.
- [x] Add explicit start-game endpoint/action requiring both participants ready.
- [x] Persist game record linked to room only when explicit start succeeds.
- [x] Ensure start is idempotent and rejects invalid states (missing participant, not ready, already started).
- [x] Connect lobby UI controls to readiness + start APIs with clear error states.
- [x] Add server tests for ready/unready/start authz and state-transition edge cases.
- [x] Add minimal room lobby/start API integration coverage for lobby flow.

- [ ] Rotate all `.env` secrets after development is complete.
- [ ] Add uptime and health monitoring for `forgetful-fish-web` and `forgetful-fish-postgres`.
- [ ] Define database backup policy (daily snapshot + periodic restore test).
- [ ] Pin and document upgrade cadence for Node, Next.js, Prisma, and Postgres images.
- [ ] Evaluate and fix outdated client behavior (stale Server Action calls after deploy).
- [ ] Expire rooms if 1 week (or something) since last game action.
- [ ] Add Discord chat room creation integration.
