# Decision Log

## 2026-02-25 Initial Planning Decisions

- Stack: TypeScript fullstack (`Next.js` + `Node/Fastify` + `WebSocket` + `Postgres`).
- Identity model for v1: basic accounts included from day one.
- Auth methods for v1: email magic link plus Google OAuth.
- Auth implementation: Auth.js (`next-auth`) with Prisma adapter.
- Match mode: private invite rooms in v1; public matchmaking queue added later.
- Rules enforcement: strict engine validation (illegal actions blocked).
- Priority UX: auto-pass by default with optional manual override/hold priority.
- Redis: defer until scale/multi-instance needs arise.
- Next.js boundary rule: strict client/server segregation with explicit API/WebSocket contracts; no Server Actions.

## 2026-02-26 Tooling Baseline Update

- Frontend stack baseline moved to Next.js 16 (`apps/web`) with flat ESLint config.
- Repo runtime baseline set to Node `22.13.0` via `.nvmrc` and `package.json` engines.

## 2026-02-26 Production Auth Deployment Decisions

- Canonical production host is apex `forgetfulfish.com`; `www` redirects to apex in app proxy.
- Production runtime is Docker on the existing external `nginx-proxy` network.
- Production database runs as a dedicated Postgres 16 container for ForgetfulFish.
- Prisma production schema changes are applied via migration deploy (`prisma migrate deploy`).

## 2026-02-27 Server AuthZ Baseline

- `apps/server` validates Auth.js session cookies against `auth_sessions` (+ linked `users`) as the source of truth for protected API access.
- Protected server routes return uniform unauthorized responses: `401` with `{ error: "unauthorized" }`.

## 2026-02-27 Room URL and Join Contract

- v1 room IDs stay UUID-based with private invite links routed as `/play/:roomId`.
- v1 has no public room discovery; link possession plus authentication gates joining.
- Room join is idempotent for existing participants and enforces a two-seat maximum.
- Seat labels are explicit and deterministic: creator is `P1`, second participant is `P2`.

## 2026-02-27 Game Start Flow Decision

- Joining a room does not auto-start a game.
- Game start requires explicit action with both players marked ready.
- Room lifecycle hardening (expiry/cleanup tuning) is deferred until gameplay UI and active game flows are in regular use.

## 2026-02-28 Hybrid Game State Persistence

- Game creation persists a versioned full snapshot (`games.state`, `games.stateVersion`) only after explicit start succeeds.
- Gameplay persistence model is hybrid: current snapshot on `games` plus append-only `game_events` for replay/audit.
- Initial start writes one `game_initialized` event at `seq=0` and aligns `games.lastAppliedEventSeq=0`.

## 2026-03-01 Dynamic DNS Automation

- Dynamic DNS for `forgetfulfish.com` uses a custom Python updater (`scripts/gandi-ddns-update.py`) instead of `gandi-live-dns` snap.
- The updater authenticates with Gandi using PAT Bearer auth and runs via systemd timer every 5 minutes.
- Managed records are `A` for `@`, `staging`, and `www` with target TTL `300`.

## 2026-03-01 Realtime WebSocket Edge Routing

- Keep browser realtime endpoint on apex host path: `wss://forgetfulfish.com/ws/rooms/:id`.
- Route `/ws/*` at `nginx-proxy` via container env path split (`forgetful-fish-server` uses `VIRTUAL_PATH=/ws/`).
- Do not proxy `/api/auth/*` to server; Auth.js routes remain on `forgetful-fish-web`.

## 2026-03-02 Reliability Hardening

- Server auth lookup now uses a 60-second in-process session cache for repeated HTTP and WebSocket auth checks.
- Room join input parsing accepts UUID room IDs only (raw ID or `/play/:roomId` URL) and maps common join statuses to clearer UI messages.
- Removed unused `rooms.closedAt` from Prisma schema and migrations.

## 2026-03-02 Rules Engine Architecture

- Rules engine design is documented in `docs/architecture/rules-engine-architecture.md`.
- Engine entry point is a single pure function `processCommand(state, command, rng): CommandResult` with no I/O.
- `GameState` uses a flat `objectPool` (ECS-style) with zone arrays holding IDs only; shared library and graveyard are in `zones`, ownership tracked on `GameObject`.
- Card definitions are plain data objects (`CardDefinition`) in one file per card under `packages/game-engine/src/cards/`; no class inheritance.
- Effect resolution follows the whiteboard/naps model: kernel writes `pendingActions`, card handlers modify them, replacement effects intercept, kernel executes.
- Continuous effects are computed via `computeGameObject` applying the 7-layer MTG layer system in order; `objectPool` holds base state, derived view is never mutated.
- Player input mid-resolution is handled via a `PendingChoice` returned from `processCommand`; resumption reloads the persisted `EffectContext` (whiteboard + `ResolutionCursor`) from the stack item and continues from the cursor position (no coroutines, no opaque continuation tokens).
- RNG is seeded and deterministic (Fisher-Yates); seed is stored in `GameState.rngSeed` and advanced on each use, enabling full replay.
- Implementation follows a five-phase order: core turn loop → spells/targeting → combat → complex effects (choices/layers) → full deck completion.

## 2026-03-03 Rules Engine Architecture Revision

- Revised `docs/architecture/rules-engine-architecture.md` based on deep analysis of XMage, Forge, SabberStone, MTG Arena, and Argentum architectures.
- Key architectural changes from original plan:
  - **Object identity**: all object references now use `(id, zcc)` pairs with zone-change counter; LKI snapshots stored on zone changes.
  - **Choice re-entry**: replaced "re-call onResolve" model with persisted `EffectContext` (whiteboard + resolution cursor) on stack items — prevents double-application bugs and makes handlers trivially idempotent.
  - **Action Modifier Pipeline**: expanded from "replacement effects intercept pendingActions" to a 4-stage pipeline (rewrite/filter/redirect/augment) covering replacement effects, task cancellation, damage redirection, and action-space modification.
  - **Ability AST**: card abilities use structured AST nodes (not closures) so Layer 3 text-changing effects (Mind Bend, Crystal Spray) can find and substitute tokens at runtime.
  - **Layer dependency**: implemented for Layer 3 from the start (not deferred to Layer 7 only) because Mind Bend/Crystal Spray interactions require it.
  - **Trigger ordering**: added within-player ordering choice (not just APNAP between players).
  - **Hidden information**: added `GameView` projection and event redaction — clients never receive full GameState, rngSeed, or opponent's hidden zone contents.
  - **Event facts**: events now carry explicit results (shuffle permutations, RNG draws, choices) for replay robustness across engine versions.
  - **GameMode hooks**: formalized shared-deck variant as a `GameMode` interface for resolving "your library"/"your graveyard" references.
  - **ETB lookahead**: data structures support CR 614.12 hypothetical state evaluation; implementation deferred until a deck card requires it.
- Implementation phases expanded from 5 to 7, front-loading identity/LKI and the action modifier pipeline.
- Follow-up clarification after Phase 3 text-change work: land-type Layer 3 rewriting shipped first, but color-word Layer 3 rewriting is explicitly deferred until the deck contains a real structured permanent-text color surface to rewrite. Dormant `fromColor` / `toColor` shape alone is not enough to justify speculative engine work.

## 2026-03-04 Rules Engine Plan Portability Guardrail

- Updated `docs/plans/rules-engine/README.md` to prevent shared-zone lock-in in foundations.
- Phase 0 now plans mode-routed logical zones (`resolveZone` + `createInitialZones`) and zone storage keyed by `ZoneRef`/`ZoneKey`, instead of fixed `{ library, graveyard, ... }` fields.
- Shared-deck behavior remains a concrete baseline mode, with an added split-zone conformance test fixture to prove the kernel stays mode-agnostic.

## 2026-03-10 UI Integration Foundation Decisions

- First gameplay integration slice uses a hybrid renderer in browser:
  - React/DOM remains the shell for controls, text, overlays, and accessible interaction affordances.
  - Canvas rendering is included from the first slice for battlefield/card-surface interaction zones.
- Initial motion library baseline remains Framer Motion for DOM-layer animation flows.
- Manual UI verification artifact policy defaults to failure-only capture (trace/video/screenshots), with optional always-capture debug runs.
- Client state model is partitioned by update frequency:
  - Zustand stores session/authoritative gameplay state used by React UI surfaces.
  - High-frequency interaction and visual effects (drag/hover/targeting/FX) remain non-persistent refs + RAF state outside Zustand.

## 2026-04-05 Phase 3 Resolve/Keyword Cutover

- `CardDefinition.onResolve` now uses primitive `kind`-based resolve specs instead of monolithic bespoke resolve-effect IDs.
- Stack resolution interprets those primitive specs directly and preserves the existing whiteboard/pause-resume model rather than compiling through a legacy adapter path.
- Projection and web consumers query resolve capabilities through `OnResolveRegistry` instead of branching on raw resolve-effect IDs.
- Haste is now modeled as a real keyword in the computed object view; granted haste uses keyword grants, and summoning-sickness legality derives from keyword presence rather than a haste-specific runtime toggle.
- Creatures entering the battlefield become summoning sick through centralized battlefield-entry handling, with computed haste clearing that restriction in the derived view.

## Notes

- These decisions can be revised, but current architecture and roadmap docs should treat them as defaults.
