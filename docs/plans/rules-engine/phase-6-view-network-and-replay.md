# Rules Engine Implementation: Phase 6 — View projection + networking + replay

Status: planned

### [ ] P6.1 — Extend `projectPlayerView` and expose `projectView` alias

**Files**: `view/projection.ts`

Implement per §13:
- Extend existing `projectPlayerView(state, viewerPlayerId)` in `view/projection.ts`
- Export `projectView(state: GameState, forPlayer: PlayerId): GameView` as the canonical alias that delegates to the same implementation path
- Redaction rules:
  - Own hand: full contents
  - Opponent hand: count only
  - Shared library: count only (no card order, no card identities)
  - Shared graveyard: full (public)
  - Battlefield: full (public) — use `computeGameObject` for derived views
  - Exile: face-up cards full
  - `rngSeed`: never included
  - `pendingChoice`: only if `forPlayer` matches `PendingChoice.forPlayer`

Current baseline:
- `projectPlayerView` already exists with redaction tests in `test/view/projection.test.ts` and `test/view/projection-redaction.test.ts`.
- This task should preserve existing behavior while closing remaining gaps (especially battlefield derived views once `computeGameObject` is available).

**Test file**: `test/view/projection.test.ts`
Depends: P0.3, P3.2
Test: **Write tests FIRST**, then implement.
1. Projecting for Player 1 shows Player 1's hand but only a count for Player 2.
2. Library contents are hidden (count only) in the projected view.
3. `rngSeed` is completely removed from all projected views.
4. `pendingChoice` is visible only to the player who needs to make the choice.
5. Battlefield permanents show their derived `GameObjectView` (computed via layers).
6. Shared graveyard is fully visible to both players.
Acceptance: No hidden information leaks in projected view.

### [ ] P6.2 — projectEvent implementation

**Files**: `view/projection.ts` (extend), `view/redaction.ts`

Implement per §13:
- `projectEvent(event: GameEvent, forPlayer: PlayerId): RedactedGameEvent`
- Redaction rules:
  - `CARD_DRAWN` for opponent → strip `cardId`
  - `SHUFFLED` → strip `resultOrder`
  - `ZONE_CHANGE` library → hand for opponent → strip card identity
  - `RNG_CONSUMED` → never sent to clients

**Test file**: `test/view/redaction.test.ts`
Depends: P0.5
Test: **Write tests FIRST**, then implement.
1. `CARD_DRAWN` event for an opponent does not contain the `cardId`.
2. `SHUFFLED` event does not reveal the new order of the library.
3. `RNG_CONSUMED` events are filtered out and not sent to players.
4. `ZONE_CHANGE` (library to hand) for an opponent hides the card identity.
5. Own `CARD_DRAWN` event includes the correct `cardId`.
6. Public events (e.g., `LIFE_CHANGED`) are sent unredacted to both players.
Acceptance: Event redaction is correct per player perspective.

### [ ] P6.3 — Event-stream replication protocol

**Files**: `view/projection.ts` (extend or new file)

Design and implement:
- Server sends `projectEvent(event, playerId)` for each new event per connected player
- Event ordering guarantees (events arrive in `seq` order)
- Batching: multiple events from a single `processCommand` call sent as a batch
- Client consumption contract: apply events sequentially to rebuild state

**Test file**: `test/view/replication.test.ts`
Depends: P6.1, P6.2
Test: **Write tests FIRST**, then implement.
1. Multiple events are batched and redacted correctly for each player.
2. Events are emitted with monotonic `seq` numbers.
3. Sequence of redacted events allows a client to maintain a consistent state.
4. Client-side event application produces a state matching `projectView`.
5. Handling of missing sequence numbers (gap detection) is possible.
6. `assertStateInvariants` holds on the client-side reconstructed state.
Acceptance: Event stream can be consumed to rebuild projected state.

### [ ] P6.4 — Reconnect snapshot protocol

Implement per §13:
- On reconnect: server sends `projectView(currentState, playerId)` as full snapshot
- Client replaces local state with snapshot
- Normal event streaming resumes

**Test file**: `test/view/reconnect.test.ts`
Depends: P6.1
Test: **Write tests FIRST**, then implement.
1. `projectView` provides a complete and sufficient state for a reconnecting client.
2. Client successfully replaces stale state with the new snapshot.
3. Subsequent events apply correctly on top of the reconnected snapshot.
4. No data leakage occurs during the snapshot transmission.
5. Reconnect snapshot passes `assertStateInvariants`.
6. Multiple reconnects in a row are handled gracefully.
Acceptance: Snapshot alone is sufficient to rebuild full client state.

### [ ] P6.5 — Replay tooling

Implement:
- Replay: given initial state + event stream, rebuild state at any point
- `replayEvents(initialState: GameState, events: GameEvent[]): GameState`
- Engine version compatibility check: compare `EventEnvelope.engineVersion` with current

**Test file**: `test/view/replay.test.ts`
Depends: P0.5, P0.3
Test: **Write tests FIRST**, then implement.
1. Replaying a recorded event stream from the initial state produces the identical final state.
2. Replay at an intermediate point matches the historical state at that point.
3. Mismatched `engineVersion` in events results in a clear error or warning.
4. Replay handles `MAKE_CHOICE` and resumed resolutions correctly.
5. Event stream with gaps is detected and handled.
6. `assertStateInvariants` passes at every step of the replay.
Acceptance: Replay produces identical state.

### [ ] P6.6 — Hidden information audit

Run a comprehensive audit:
- For every event type, verify `projectEvent` never leaks hidden info
- For `projectView`, verify no library order, no opponent hand contents, no RNG seed
- For reconnect, verify snapshot is correctly redacted

**Test file**: `test/view/audit.test.ts`
Depends: P6.1, P6.2
Test: **Write tests FIRST**, then implement.
1. Exhaustive check of all event types for Player 1 vs Player 2 redaction.
2. Verification that `rngSeed` is never present in any projected object.
3. Verification that `objectPool` only contains derived views in the projection.
4. Verification that library order is never leaked via `ZONE_CHANGE` indices.
5. `PendingChoice` details for other players are never leaked.
6. Automated audit scan across 1000 generated game states.
Acceptance: No hidden information leaks found.

---
