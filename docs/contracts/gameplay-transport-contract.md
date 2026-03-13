# Gameplay Transport Contract

Status: current gameplay transport baseline for the active web/server integration path.

Canonical schema source: `packages/realtime-contract/src/index.ts`.

## HTTP Route

- Endpoint: `POST /api/rooms/:id/commands`
- Request schema: `gameplayCommandSubmissionSchema`
- Success response schema: `gameplayCommandResponseSchema`

## Realtime Route

- Endpoint: `GET /ws/rooms/:id`
- Gameplay update message type: `room_game_updated`
- Envelope schema: `wsRoomGameUpdatedMessageSchema`
- Payload schema: `gameplayCommandResponseSchema`

## Frozen Command Response Fields (Phase A)

`gameplayCommandResponseSchema` fields are frozen as:

- `roomId`: authoritative room identifier carrying the update
- `gameId`: authoritative game identifier carrying the update
- `stateVersion`: authoritative monotonic game state version after command application
- `lastAppliedEventSeq`: authoritative monotonic applied event sequence watermark
- `pendingChoice`: nullable pending choice descriptor for next required player input
- `emittedEvents`: ordered metadata list for events applied by the command

## Envelope Evolution Policy

- Envelope shape remains `{ type, schemaVersion, data }`.
- `schemaVersion` stays `1` for additive-only, backward-compatible changes.
- Breaking changes require a schema-version bump and dual-compat handling during rollout.
- Field removals/renames are prohibited within a schema version.
