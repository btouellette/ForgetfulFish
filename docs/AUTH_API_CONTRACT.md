# Forgetful Fish Webapp - Auth API Contract (v1 Draft)

This contract assumes `Auth.js` with the Prisma adapter, Google provider, and email magic-link provider. We use library-owned auth routes instead of custom token/OAuth implementations.

## Libraries
- `next-auth` (Auth.js) for session, providers, CSRF, callback handling.
- `@auth/prisma-adapter` for persistence.
- `nodemailer` transport or provider SDK (for example Resend) for magic-link email delivery.

## Route Surface

### `POST /api/auth/signin/email`
- Purpose: request a magic link.
- Body:
```json
{
  "email": "player@example.com",
  "callbackUrl": "/lobby"
}
```
- Success: `200` with generic success payload (never reveals whether email exists).
- Errors:
  - `400` invalid email format
  - `429` rate limited
  - `500` provider/transient failure

### `GET /api/auth/signin/google`
- Purpose: begin Google OAuth login.
- Behavior: 302 redirect to Google consent screen.

### `GET /api/auth/callback/google`
- Purpose: OAuth callback endpoint.
- Behavior: handled by Auth.js; on success creates/links account and redirects to `callbackUrl`.

### `GET /api/auth/callback/email`
- Purpose: magic-link verification callback endpoint.
- Behavior: handled by Auth.js; token is single-use and expiration-checked.

### `GET /api/auth/session`
- Purpose: fetch current session for UI bootstrap.
- Success `200`:
```json
{
  "user": {
    "id": "ckxyz...",
    "email": "player@example.com",
    "name": "Player One",
    "image": null
  },
  "expires": "2026-03-25T10:00:00.000Z"
}
```
- Unauthenticated: `200` with `null` body (Auth.js default behavior).

### `POST /api/auth/signout`
- Purpose: end the current session.
- Success: `200` and session cookie invalidated.

## Security and Abuse Controls
- CSRF protection uses Auth.js defaults on sensitive endpoints.
- Rate limiting required on magic-link request route by IP and email tuple.
- Email response is non-enumerating (same message for existing/non-existing accounts).
- OAuth validation handled by provider metadata plus Auth.js callback checks.
- Never log raw auth tokens, OAuth codes, or magic-link URLs.

## Session Contract for App Code
- Session strategy: database sessions (`auth_sessions`) for server-side revocation.
- App authorization uses `session.user.id` as canonical actor id.
- Room/game APIs must reject unauthenticated requests with `401`.
