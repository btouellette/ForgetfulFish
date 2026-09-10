# Product Surface Phase PS3 — Mulligan experience

Status: planned

**Reachability gap this phase closes**: once rules-engine Phase 8 lands, a game pauses in an opening-hand
step that no client can complete. This phase carries the step through the transport, the start handoff,
and the UI so players can keep or mulligan from the browser.

**Depends**: `P8.3` (opening-hand status and actions in the projected view), `P8.2` (`MULLIGAN` /
`KEEP_HAND` commands).

## Slices

### [ ] PS3.1 — Opening-hand step in the transport contract

**Files**:

- `packages/realtime-contract/src/index.ts`
- `packages/realtime-contract/test/schema.test.ts`
- `apps/server/src/room-store/apply-command.ts`
- `apps/server/test/*`

**Test-first**:

1. Failing test: the gameplay command union accepts `MULLIGAN` and `KEEP_HAND`.
2. Failing test: the player view carries the viewer's opening-hand status and mulligan eligibility.
3. Failing test: the server routes both commands to the engine and rejects them from a non-participant.
4. Failing test: the resulting state is broadcast to both players, so each sees the opponent's resolved status.

**Acceptance**:

- No client-side re-derivation of mulligan eligibility.

**Commit target**: `Add mulligan commands to gameplay transport`

---

### [ ] PS3.2 — Opening-hand UI and start handoff

**Files**:

- `apps/web/components/play/OpeningHandPanel.tsx` (new)
- `apps/web/components/play/OpeningHandPanel.test.tsx` (new)
- `apps/web/components/play/GameplayView.tsx`
- `apps/web/components/play/GameplayView.test.tsx`
- `apps/web/lib/stores/game-store.ts`
- `apps/web/lib/stores/game-store.test.ts`
- `e2e/room-realtime.spec.ts`

**Test-first**:

1. Failing test: entering a game in the opening-hand step shows the opener with keep and mulligan controls.
2. Failing test: mulligan is hidden or disabled when the viewer is ineligible, with the reason shown.
3. Failing test: after keeping, the viewer sees a waiting-on-opponent state and no gameplay controls.
4. Failing test: the panel disappears and normal gameplay controls appear once both players resolve.
5. Failing E2E: both players complete the opening-hand step — one mulliganing — and reach turn one.

**Acceptance**:

- The lobby-to-gameplay handoff lands in the opening-hand step without a dead frame or manual refresh.

**Commit target**: `Add opening-hand and mulligan UI`

## Exit Criteria

- Both players complete the opening-hand step from the browser before turn one.
- Mulligan eligibility shown in the UI always matches the server's.
