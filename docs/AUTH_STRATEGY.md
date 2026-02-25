# Forgetful Fish Webapp - Auth Strategy (v1)

## Selected Methods
- Email magic link.
- Google OAuth.

Both methods map to a single canonical user record so players can use either login path and keep the same identity.

## Preferred Implementation
- Use `Auth.js` (`next-auth`) with Prisma adapter.
- Use official Google provider for OAuth.
- Use Auth.js email provider for magic-link sign-in.
- Avoid custom token generation, OAuth state handling, or session cryptography.

## UX Flow
- `Sign in` screen offers:
  - `Continue with Google`
  - `Email me a magic link`
- Successful auth returns to lobby and preserves pending room join intent.

## Data Model (draft)
- `users`: canonical identity, profile, timestamps.
- `auth_accounts`: provider mapping (`google`, provider user id, user id).
- `auth_sessions`: revocable server-side sessions.
- `auth_magic_links`: library-managed verification tokens with expiration.

## Security Requirements
- Magic links are single-use and short-lived.
- Enforce expiration and replay protection through Auth.js verification flow.
- Add rate limits to magic-link request endpoint.
- Validate OAuth claims through standard provider flow and callback checks.
- Do not log raw tokens, OAuth codes, or full magic-link URLs.

## Operational Notes
- Use HTTPS-only callback and auth routes.
- Maintain session invalidation on logout.
- Log auth events for audit and abuse monitoring (without sensitive token material).
