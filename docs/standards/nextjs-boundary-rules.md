# Next.js Boundary Rules

These rules apply to `apps/web`.

## Boundary Model
- `apps/web` is a presentation/client app first.
- `apps/server` is the authoritative backend for game logic and realtime state.
- Communication between `apps/web` and backend must happen through explicit HTTP/WebSocket contracts.

## Strict Segregation Requirements
- No Next.js Server Actions (`"use server"`) in app code.
- No direct database access from client components.
- No game rules/business logic implemented in Next route handlers.
- Shared request/response payloads must use typed schemas (Zod) in shared packages.

## Allowed Server-Side Responsibilities in `apps/web`
- Auth.js authentication routes and session handling only.
- SSR/Server Components for rendering and fetching already-exposed backend data.
- UI composition and user session-aware routing.

## Contract Rules
- Every backend call from web must target a documented endpoint/event contract.
- Contract changes require updates to docs and corresponding tests.
- Client should treat backend responses as untrusted and validate data at boundaries.

## Testing Expectations
- Add contract tests when changing payload shape.
- Add integration tests for auth flows that cross web/server boundaries.
- Add regression tests for any boundary violation bug.
