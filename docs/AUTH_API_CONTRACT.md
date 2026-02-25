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
- Successful auth redirects to lobby (or preserved callback URL).

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
- Rate limit magic-link requests by IP + email tuple.
- Do not leak account existence in email signin responses.
- Do not log raw tokens, OAuth codes, or full magic links.

## App Authorization Contract
- Session user id is canonical actor id.
- Room/game endpoints reject unauthenticated requests with `401`.
