# Auth (v1)

## Strategy

- Methods: email magic link + Google OAuth.
- Identity: both methods map to one canonical user.
- Implementation: Auth.js (`next-auth`) + Prisma adapter.
- Rule: use library auth/session behavior; do not build custom token/OAuth/session crypto.

## Data Model

- `users`
- `auth_accounts`
- `auth_sessions`
- `auth_magic_links`

## UX

- Sign-in offers `Continue with Google` and `Email me a magic link`.
- Successful auth redirects to `GOOGLE_CALLBACK` when configured; otherwise to static auth verification page (`/auth/verify`).

## API Contract

Auth routes are owned by Auth.js.

## Routes

- `POST /api/auth/signin/email`: request magic link (non-enumerating response).
- `GET /api/auth/signin/google`: start Google OAuth.
- `GET /api/auth/callback/email`: verify magic link.
- `GET /api/auth/callback/google`: OAuth callback.
- `GET /api/auth/session`: return session or `null`.
- `POST /api/auth/signout`: revoke current session.

## Request/Response Rules

- Magic link request body: `{ email, callbackUrl }`.
- `GET /api/auth/session` includes `user.id`, `email`, optional profile fields, and `expires`.
- Unauthenticated session response is `null`.

## Security Rules

- Keep Auth.js CSRF protections enabled.
- Rate limit magic-link requests by IP + normalized email tuple.
  - Policy: fixed window, 5 requests per 10 minutes per tuple.
- Do not leak account existence in email signin responses.
- Do not log raw tokens, OAuth codes, or full magic links.

## App Authorization Contract

- Session user id is canonical actor id.
- Room/game endpoints reject unauthenticated requests with `401`.

## Authoritative Server Endpoints (v1 scaffold)

- `GET /api/me`: authenticated actor identity; returns `{ userId, email }`.
- `POST /api/rooms`: requires auth; returns `201` with `{ roomId, ownerUserId, seat }`.
- `POST /api/rooms/:id/join`: requires auth; returns `200` with `{ roomId, userId, seat }`.
- `GET /api/rooms/:id`: requires auth; returns room lobby payload for room participants.
- `POST /api/rooms/:id/ready`: requires auth; request `{ ready: boolean }`; updates caller readiness.
- `POST /api/rooms/:id/start`: requires auth; starts game only when both players are ready.
- Unauthorized response is uniform: `401` with `{ error: "unauthorized" }`.

## Realtime WebSocket Contract (Milestone 2)

- Endpoint: `GET /ws/rooms/:id`.
- Source of truth for WS message schema/types: `packages/realtime-contract/src/index.ts`.
- Auth: requires valid Auth.js session cookie on handshake.
- Authorization: caller must be a room participant; non-participants are rejected.
- Server message envelope is versioned and schema-validated:
  - shape: `{ type, schemaVersion, data }`
  - current `schemaVersion`: `1`
- Server event types:
  - `subscribed`: initial canonical room snapshot on connect/reconnect.
  - `room_lobby_updated`: authoritative lobby update after join/ready/start mutations.
  - `game_started`: explicit game start payload (`roomId`, `gameId`, `gameStatus`).
  - `error`: protocol-level recoverable error (`code`, `message`).
  - `pong`: heartbeat response to client `ping`.

## Gameplay Transport Contract (Milestone 2.5 Phase A)

- Canonical schema source remains `packages/realtime-contract/src/index.ts`.
- HTTP gameplay command route:
  - Endpoint: `POST /api/rooms/:id/commands`.
  - Request schema: `gameplayCommandSubmissionSchema`.
  - Success response schema: `gameplayCommandResponseSchema`.
- Realtime gameplay update event:
  - WS message type: `room_game_updated`.
  - Envelope schema: `wsRoomGameUpdatedMessageSchema`.
  - Payload schema: `gameplayCommandResponseSchema`.

### Gameplay command outcome fields (frozen for Phase A)

- `stateVersion`: authoritative monotonic game state version after command application.
- `lastAppliedEventSeq`: authoritative monotonic applied event sequence watermark.
- `pendingChoice`: nullable pending choice descriptor for next required player input.
- `emittedEvents`: ordered metadata list for events applied by the command.

### Envelope evolution policy

- Envelope shape remains `{ type, schemaVersion, data }`.
- `schemaVersion` stays `1` for additive-only, backward-compatible changes.
- Breaking changes require a schema-version bump and dual-compat handling during rollout.
- Field removals/renames are prohibited within a schema version.

## Room Semantics (v1)

- Room IDs are UUIDs and are shared via invite URLs in the form `/play/:roomId`.
- Seats are explicit and deterministic: `P1` for creator, `P2` for second participant.
- Join is idempotent for existing participants: same authenticated user gets `200` with existing seat.
- Join returns `404` with `{ error: "room_not_found" }` when room does not exist.
- Join returns `409` with `{ error: "room_full" }` when both seats are occupied.
- Lobby and readiness endpoints return `403` with `{ error: "forbidden" }` when caller is not a room participant.
- Lobby response shape: `{ roomId, participants: [{ userId, seat, ready }], gameId, gameStatus }`.
- Game start response shape: `{ roomId, gameId, gameStatus: "started" }`.
- Start returns `409` with `{ error: "room_not_ready" }` until two participants are present and both marked ready.
- Readiness updates after game start are treated as no-op and return current readiness state.
