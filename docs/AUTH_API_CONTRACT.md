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
- Unauthorized response is uniform: `401` with `{ error: "unauthorized" }`.

## Room Semantics (v1)

- Room IDs are UUIDs and are shared via invite URLs in the form `/play/:roomId`.
- Seats are explicit and deterministic: `P1` for creator, `P2` for second participant.
- Join is idempotent for existing participants: same authenticated user gets `200` with existing seat.
- Join returns `404` with `{ error: "room_not_found" }` when room does not exist.
- Join returns `409` with `{ error: "room_full" }` when both seats are occupied.
